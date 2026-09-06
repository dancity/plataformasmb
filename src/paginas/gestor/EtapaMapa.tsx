import { useMemo, useState } from 'react';
import { DialogoConfirmacao } from '@/componentes/Modal';
import { Botao, Cartao, Selo, juntar } from '@/componentes/ui';
import type { Sessao } from '@/lib/auth';
import { calcularLinhas, somarTotais } from '@/lib/pedido';
import type { ContextoPedido, EscritorPedido, LinhaCalculada } from '@/lib/pedido';
import { SEGMENTOS, anosDoSegmento } from '@dominio/anosEscolares';
import type { AnoEscolarId, SegmentoId } from '@dominio/anosEscolares';
import { formatarBRL, formatarBRLcurto } from '@dominio/preco';
import type { Centavos } from '@dominio/tipos';

/**
 * Etapa 3 — o mapa da contratação.
 *
 * Uma coluna por ano escolar, um card por solução. Fica grande, e tudo bem:
 * aqui não se decide, se confere. Um segmento aberto por vez, porque quatro
 * abertos são 17 colunas e a rolagem infinita de volta. Recolhido, a barra
 * ainda informa alunos, soluções e total — senão obriga a abrir tudo para
 * procurar.
 */
export function EtapaMapa({
  ctx,
  sessao,
  somenteLeitura,
  escritor,
  aoVoltar,
  aoSalvar,
}: {
  ctx: ContextoPedido;
  sessao: Sessao;
  somenteLeitura: boolean;
  escritor: EscritorPedido;
  aoVoltar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const linhas = useMemo(
    () => calcularLinhas(ctx, sessao.regionalId ?? ''),
    [ctx, sessao.regionalId],
  );
  const totais = useMemo(() => somarTotais(linhas), [linhas]);

  const [aberto, setAberto] = useState<SegmentoId | null>('anos_iniciais');
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const contratadas = linhas.filter((l) => (l.item?.anosSelecionados.length ?? 0) > 0);
  const porUnidade = contratadas.filter((l) => l.habilitacao.preco.base === 'escola');
  const porAluno = contratadas.filter((l) => l.habilitacao.preco.base !== 'escola');
  const pendentes = linhas.filter((l) => !l.decidida);

  /**
   * Rateia o valor de uma solução no ano escolar, para a coluna. Por
   * crédito, o preço é por crédito, não por aluno — e a quantidade digitada
   * já é o total daquele ano, não um multiplicador sobre os alunos.
   */
  function valorNoAno(l: LinhaCalculada, ano: AnoEscolarId): Centavos {
    const preco = l.habilitacao.preco;
    const quantidade =
      preco.base === 'credito' ? (l.item?.creditosPorAno?.[ano] ?? 0) : (l.item?.alunosPorAno[ano] ?? 0);
    if (quantidade === 0) return 0;
    const vezes = preco.ciclo === 'mensal' ? preco.meses : 1;
    return preco.valor * quantidade * vezes;
  }

  function resumoSegmento(seg: SegmentoId) {
    const anos = anosDoSegmento(seg).filter((a) => (ctx.previsao[a.id] ?? 0) > 0);
    const alunos = anos.reduce((s, a) => s + (ctx.previsao[a.id] ?? 0), 0);
    const solucoes = porAluno.filter((l) =>
      anos.some((a) => (l.item?.alunosPorAno[a.id] ?? 0) > 0),
    );
    const total = solucoes.reduce(
      (s, l) => s + anos.reduce((t, a) => t + valorNoAno(l, a.id), 0),
      0,
    );
    return { anos, alunos, solucoes: solucoes.length, total };
  }

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      await escritor.enviarPedido(ctx.ciclo.id);
      await aoSalvar();
    } catch (e) {
      const codigo = (e as { code?: string }).code ?? '';
      const mensagem = (e as { message?: string }).message ?? '';
      setErro(
        codigo === 'functions/not-found' || codigo === 'functions/internal'
          ? 'O envio ainda não está disponível: as funções do servidor não foram publicadas. Sua escolha está salva — nada se perdeu.'
          : mensagem || 'Não foi possível enviar o pedido. Tente de novo.',
      );
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  const enviado = !!ctx.pedido && ctx.pedido.estado !== 'rascunho' && ctx.pedido.estado !== 'devolvido';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-brand">Mapa da contratação {ctx.ciclo.anoAlvo}</h2>
        <p className="max-w-prose text-sm text-gray-500">
          A decisão inteira de uma vez. É aqui que se percebe o que ficou estranho — um ano sem
          nada, ou um com o dobro do vizinho.
        </p>
      </div>

      {porUnidade.length > 0 && (
        <Cartao className="gap-2 border-l-3 border-l-brand-light p-4">
          <span className="font-mono text-[11px] tracking-wider text-brand uppercase">
            Unidade inteira
          </span>
          {porUnidade.map((l) => (
            <div key={l.produto.id} className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">{l.produto.nome}</span>
              <span className="text-xs text-gray-500">
                {ctx.fornecedores.get(l.produto.fornecedorId)} — licença por escola, não varia com o
                ano escolar
              </span>
              <div className="flex-1" />
              <span className="font-mono text-sm tabular-nums">{formatarBRL(l.valorAnual)}</span>
            </div>
          ))}
        </Cartao>
      )}

      <Cartao className="overflow-hidden p-0">
        {SEGMENTOS.map((seg) => {
          const { anos, alunos, solucoes, total } = resumoSegmento(seg.id);
          if (anos.length === 0) return null;
          const expandido = aberto === seg.id;

          return (
            <div key={seg.id} className="flex flex-col gap-3 border-b border-gray-200 p-4 last:border-b-0">
              <button
                type="button"
                onClick={() => setAberto(expandido ? null : seg.id)}
                aria-expanded={expandido}
                className="flex flex-wrap items-center gap-3 text-left"
              >
                <span aria-hidden="true" className="w-3 text-xs text-gray-400">
                  {expandido ? '▾' : '▸'}
                </span>
                <span className="text-sm font-semibold text-brand">{seg.nome}</span>
                <span className="font-mono text-xs text-gray-500">
                  {anos.length} ano{anos.length === 1 ? '' : 's'} · {alunos} alunos · {solucoes}{' '}
                  soluç{solucoes === 1 ? 'ão' : 'ões'}
                </span>
                <div className="flex-1" />
                <span className="font-mono text-sm font-medium tabular-nums">
                  {formatarBRL(total)}
                </span>
              </button>

              {expandido && (
                <div
                  className="grid auto-cols-[196px] grid-flow-col gap-3 overflow-x-auto pb-2"
                  role="group"
                  aria-label={`Colunas de ${seg.nome}`}
                >
                  {anos.map((ano) => {
                    const doAno = porAluno.filter(
                      (l) => (l.item?.alunosPorAno[ano.id] ?? 0) > 0,
                    );
                    const totalAno = doAno.reduce((s, l) => s + valorNoAno(l, ano.id), 0);
                    return (
                      <div key={ano.id} className="flex flex-col gap-2">
                        <div className="flex flex-col rounded-lg bg-gray-100 px-3 py-2">
                          <span className="text-sm font-semibold">{ano.nome}</span>
                          <span className="font-mono text-[11px] text-gray-500">
                            {ctx.previsao[ano.id]} alunos
                          </span>
                        </div>

                        {doAno.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-gray-300 p-3 text-xs text-gray-500">
                            Nenhuma solução contratada para este ano.
                          </div>
                        ) : (
                          doAno.map((l) => {
                            const obrigatoria = l.habilitacao.obrigatorios.includes(ano.id);
                            return (
                              <div
                                key={l.produto.id}
                                className={juntar(
                                  'flex flex-col gap-0.5 rounded-lg border border-gray-200 border-l-3 bg-white p-3',
                                  obrigatoria ? 'border-l-orange-400' : 'border-l-brand-medium',
                                )}
                              >
                                <span className="text-xs leading-snug font-medium">
                                  {l.produto.nome}
                                </span>
                                <span className="text-[11px] text-gray-500">
                                  {ctx.fornecedores.get(l.produto.fornecedorId)}
                                  {obrigatoria && ' · obrigatória'}
                                </span>
                                <span className="font-mono text-[11px] text-gray-500 tabular-nums">
                                  {formatarBRL(valorNoAno(l, ano.id))}
                                </span>
                              </div>
                            );
                          })
                        )}

                        <div className="flex items-baseline justify-between border-t-2 border-gray-300 px-1 pt-2">
                          <span className="font-mono text-[10px] tracking-wider text-gray-500 uppercase">
                            total
                          </span>
                          <span className="font-mono text-xs font-medium tabular-nums">
                            {formatarBRLcurto(totalAno)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </Cartao>

      {pendentes.length > 0 && !somenteLeitura && (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          Faltam decisões em: {pendentes.map((l) => l.produto.nome).join(', ')}. Volte à escolha e
          marque os anos ou diga que não vai contratar — caixa vazia não diz se você recusou ou se
          ainda não olhou.
        </p>
      )}

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      <Cartao className="flex-row flex-wrap items-center gap-5 p-4">
        <div className="flex flex-col">
          <span className="text-xs tracking-wide text-gray-500 uppercase">Obrigatórias</span>
          <span className="font-mono text-sm font-medium tabular-nums">
            {formatarBRL(totais.obrigatorio)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs tracking-wide text-gray-500 uppercase">Opcionais</span>
          <span className="font-mono text-sm font-medium tabular-nums">
            {formatarBRL(totais.opcional)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs tracking-wide text-gray-500 uppercase">
            Total estimado {ctx.ciclo.anoAlvo}
          </span>
          <span className="font-mono text-xl font-semibold text-brand tabular-nums">
            {formatarBRL(totais.total)}
          </span>
        </div>

        <div className="flex-1" />

        {enviado ? (
          <Selo tom="concluido">enviado para a regional</Selo>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoVoltar}>
              Voltar à escolha
            </Botao>
            <Botao
              onClick={() => setConfirmando(true)}
              disabled={somenteLeitura || pendentes.length > 0 || totais.total === 0}
            >
              Enviar pedido
            </Botao>
          </>
        )}
      </Cartao>

      <p className="text-xs text-gray-500">
        Os valores são estimativas calculadas sobre a previsão de alunos informada e serão
        ajustados pela matrícula efetiva.
      </p>

      <DialogoConfirmacao
        aberto={confirmando}
        nivel="perigo"
        titulo="Enviar o pedido para a regional"
        descricao="Depois do envio o pedido sai da sua mão: só volta a ser editável se a regional devolver para ajuste."
        detalhe={
          <ul className="flex flex-col gap-1">
            <li>
              <strong>{contratadas.length}</strong> soluções contratadas
            </li>
            <li>
              Total estimado: <strong>{formatarBRL(totais.total)}</strong> por ano
            </li>
            <li>Unidade: {ctx.unidade.nome}</li>
          </ul>
        }
        textoConfirmar="Enviar pedido"
        nomeParaDigitar={ctx.unidade.nome}
        carregando={enviando}
        aoCancelar={() => setConfirmando(false)}
        aoConfirmar={() => void enviar()}
      />
    </div>
  );
}
