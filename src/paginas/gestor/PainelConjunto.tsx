import { useCallback, useMemo, useState } from 'react';
import { Botao, Cartao, LogoFornecedor, Selo, juntar } from '@/componentes/ui';
import type { Sessao } from '@/lib/auth';
import type { ContextoPedido, EscritorPedido, LinhaCalculada } from '@/lib/pedido';
import { calcularItem } from '@dominio/preco';
import { descreverPreco, formatarBRL } from '@dominio/preco';
import { anoEscolar, ordenarAnos } from '@dominio/anosEscolares';
import type { AnoEscolarId } from '@dominio/anosEscolares';
import { conflitosDoConjunto, escolhidoNoAno } from '@dominio/vinculos';
import type { Conjunto } from '@dominio/tipos';

/**
 * A decisão de um conjunto de escolha única: uma linha por ano escolar, uma
 * coluna por trilha, e "nenhuma" no fim.
 *
 * É uma tabela e não duas telas porque a exclusividade é POR ANO: em rádio de
 * linha ela é estrutural, não um aviso depois do erro. E porque a decisão real
 * é comparar preço entre as trilhas naquele ano — comparação que em duas telas
 * a pessoa teria que fazer de memória.
 */

/** Ano marcado numa trilha, do jeito que a tabela manipula. */
type Selecao = Map<string, Set<AnoEscolarId>>;

function selecaoInicial(linhas: readonly LinhaCalculada[]): Selecao {
  const mapa: Selecao = new Map();
  for (const l of linhas) {
    const anos = new Set<AnoEscolarId>(l.habilitacao.obrigatorios);
    for (const a of l.item?.anosSelecionados ?? []) {
      if (l.habilitacao.opcionais.includes(a)) anos.add(a);
    }
    mapa.set(l.produto.id, anos);
  }
  return mapa;
}

export function PainelConjunto({
  ctx,
  sessao,
  conjunto,
  linhas,
  somenteLeitura,
  escritor,
  totalGeral,
  ultimo,
  aoVoltar,
  aoAvancar,
  aoSalvar,
}: {
  ctx: ContextoPedido;
  sessao: Sessao;
  conjunto: Conjunto;
  linhas: readonly LinhaCalculada[];
  somenteLeitura: boolean;
  escritor: EscritorPedido;
  totalGeral: number;
  ultimo: boolean;
  aoVoltar: () => void;
  aoAvancar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const [selecao, setSelecao] = useState<Selecao>(() => selecaoInicial(linhas));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // As linhas da tabela: todo ano em que ALGUMA trilha é oferecida.
  const anos = useMemo(() => {
    const todos = new Set<AnoEscolarId>();
    for (const l of linhas) {
      for (const a of l.habilitacao.opcionais) todos.add(a);
      for (const a of l.habilitacao.obrigatorios) todos.add(a);
    }
    return ordenarAnos([...todos]);
  }, [linhas]);

  const conflitos = useMemo(() => conflitosDoConjunto(conjunto, selecao), [conjunto, selecao]);

  /** Marca uma trilha no ano — e só uma: é isso que o conjunto significa. */
  const escolher = useCallback(
    (ano: AnoEscolarId, produtoId: string | null) => {
      setSelecao((atual) => {
        const nova: Selecao = new Map();
        for (const [id, marcados] of atual) {
          const copia = new Set(marcados);
          copia.delete(ano);
          nova.set(id, copia);
        }
        if (produtoId) nova.get(produtoId)?.add(ano);
        return nova;
      });
    },
    [],
  );

  const valorDe = useCallback(
    (l: LinhaCalculada, deAnos: readonly AnoEscolarId[]) =>
      calcularItem(l.habilitacao.preco, ctx.previsao, deAnos).valorAnual,
    [ctx.previsao],
  );

  const totalConjunto = linhas.reduce(
    (soma, l) => soma + valorDe(l, [...(selecao.get(l.produto.id) ?? [])]),
    0,
  );

  async function gravar(depois: () => void) {
    if (somenteLeitura) {
      depois();
      return;
    }
    if (conflitos.length > 0) {
      setErro('Resolva os anos marcados em mais de uma trilha antes de continuar.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const pedidoId = await escritor.abrirRascunho(ctx.ciclo, sessao);
      // Uma decisão por trilha: o conjunto é a tela, não o documento. Trilha
      // sem nenhum ano vira recusa explícita — caixa vazia não diz se a
      // unidade descartou ou ainda não olhou.
      for (const l of linhas) {
        const marcados = [...(selecao.get(l.produto.id) ?? [])].filter((a) =>
          l.habilitacao.opcionais.includes(a),
        );
        await escritor.salvarDecisao(
          pedidoId,
          l.produto,
          l.habilitacao,
          ctx.fornecedores.get(l.produto.fornecedorId)?.nome ?? '',
          ctx.previsao,
          { anos: marcados, recusado: marcados.length === 0 },
        );
      }
      await aoSalvar();
      depois();
    } catch {
      setErro('Não foi possível salvar esta decisão. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Cartao className="gap-3 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-brand">{conjunto.nome}</h2>
          <Selo tom="neutro">uma trilha por ano</Selo>
        </div>
        {conjunto.descricao && (
          <p className="max-w-prose text-sm text-gray-500">{conjunto.descricao}</p>
        )}
        <p className="max-w-prose text-sm text-gray-500">
          Em cada ano escolar a unidade leva no máximo uma destas soluções. Dá para levar todas,
          desde que em anos diferentes.
        </p>
      </Cartao>

      {conflitos.length > 0 && (
        <p role="alert" className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          {conflitos.length === 1 ? 'O ano' : 'Os anos'}{' '}
          {conflitos.map((c) => anoEscolar(c.ano).nome).join(', ')}{' '}
          {conflitos.length === 1 ? 'está marcado' : 'estão marcados'} em mais de uma trilha — isso
          vem de uma escolha feita antes de elas passarem a competir entre si. Escolha qual fica.
        </p>
      )}

      <Cartao className="gap-0 overflow-hidden p-0">
        <div className="overflow-x-auto">
          {/* Piso de legibilidade: abaixo disso a tabela rola dentro do
              cartão em vez de espremer nome e preço até ficarem ilegíveis. */}
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Ano escolar
                </th>
                {linhas.map((l) => {
                  const fornecedor = ctx.fornecedores.get(l.produto.fornecedorId);
                  return (
                    <th key={l.produto.id} className="px-3 py-3 text-center align-bottom">
                      <span className="flex flex-col items-center gap-1.5">
                        <LogoFornecedor
                          nome={fornecedor?.nome ?? '?'}
                          logo={fornecedor?.logo}
                          tamanho="sm"
                        />
                        <span className="text-sm font-semibold text-brand">{l.produto.nome}</span>
                        <span className="font-mono text-[11px] font-normal text-gray-500">
                          {descreverPreco(l.habilitacao.preco)}
                        </span>
                      </span>
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-center text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Nenhuma
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Valor no ano
                </th>
              </tr>
            </thead>
            <tbody>
              {anos.map((ano) => {
                const escolhido = escolhidoNoAno(conjunto, selecao, ano);
                const emConflito = conflitos.some((c) => c.ano === ano);
                const linhaEscolhida = linhas.find((l) => l.produto.id === escolhido);
                return (
                  <tr
                    key={ano}
                    className={juntar(
                      'border-b border-gray-100 last:border-b-0',
                      emConflito && 'bg-amber-50',
                    )}
                  >
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap text-gray-700">
                      {anoEscolar(ano).nome}
                      <span className="ml-2 font-mono text-xs font-normal text-gray-500 tabular-nums">
                        {ctx.previsao[ano] ?? 0} alunos
                      </span>
                    </th>

                    {linhas.map((l) => {
                      const oferecido =
                        l.habilitacao.opcionais.includes(ano) ||
                        l.habilitacao.obrigatorios.includes(ano);
                      const travadoObrigatorio = l.habilitacao.obrigatorios.includes(ano);
                      return (
                        <td key={l.produto.id} className="px-3 py-2.5 text-center">
                          {oferecido ? (
                            <input
                              type="radio"
                              name={`${conjunto.id}-${ano}`}
                              checked={escolhido === l.produto.id}
                              disabled={somenteLeitura || salvando || travadoObrigatorio}
                              onChange={() => escolher(ano, l.produto.id)}
                              aria-label={`${anoEscolar(ano).nome}: ${l.produto.nome}`}
                              className="h-4 w-4 accent-[var(--color-brand-medium)] disabled:opacity-50"
                            />
                          ) : (
                            /* Não oferecido neste ano: traço, não rádio
                               desabilitado — não é uma alternativa que a
                               unidade perdeu, simplesmente não existe. */
                            <span aria-label="não oferecido" className="text-gray-300">
                              –
                            </span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="radio"
                        name={`${conjunto.id}-${ano}`}
                        checked={!escolhido && !emConflito}
                        disabled={
                          somenteLeitura ||
                          salvando ||
                          linhas.some((l) => l.habilitacao.obrigatorios.includes(ano))
                        }
                        onChange={() => escolher(ano, null)}
                        aria-label={`${anoEscolar(ano).nome}: nenhuma`}
                        className="h-4 w-4 accent-[var(--color-brand-medium)] disabled:opacity-50"
                      />
                    </td>

                    <td className="px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap text-gray-600 tabular-nums">
                      {linhaEscolhida ? formatarBRL(valorDe(linhaEscolhida, [ano])) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Cartao>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      <Cartao className="flex-row flex-wrap items-center gap-5 p-4">
        <div className="flex flex-col">
          <span className="text-xs tracking-wide text-gray-500 uppercase">Este conjunto / ano</span>
          <span className="font-mono text-sm font-medium tabular-nums">
            {formatarBRL(totalConjunto)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs tracking-wide text-gray-500 uppercase">Total até aqui</span>
          <span className="font-mono text-base font-semibold text-brand tabular-nums">
            {formatarBRL(totalGeral)}
          </span>
        </div>

        <div className="flex-1" />

        <Botao variante="secundario" carregando={salvando} onClick={() => void gravar(aoVoltar)}>
          Voltar
        </Botao>
        <Botao carregando={salvando} onClick={() => void gravar(aoAvancar)}>
          {ultimo ? 'Ver o mapa' : 'Próxima solução'}
        </Botao>
      </Cartao>
    </div>
  );
}
