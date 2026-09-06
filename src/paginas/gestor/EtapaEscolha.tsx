import { useCallback, useEffect, useMemo, useState } from 'react';
import { Botao, Cartao, Entrada, EstadoVazio, Selo, juntar } from '@/componentes/ui';
import type { Sessao } from '@/lib/auth';
import { calcularLinhas, somarTotais } from '@/lib/pedido';
import type { ContextoPedido, EscritorPedido, LinhaCalculada } from '@/lib/pedido';
import { SEGMENTOS, anoEscolar, anosDoSegmento, aplicarLicencas, ordenarAnos } from '@dominio/anosEscolares';
import type { AnoEscolarId, PrevisaoPorAno } from '@dominio/anosEscolares';
import { calcularItem, descreverPreco, formatarBRL, rotularMultiploCredito } from '@dominio/preco';

/**
 * Etapa 2 — uma solução por vez.
 *
 * Treze soluções cabem numa sequência de treze telas leves, e cada tela ganha
 * espaço para o que a decisão exige: descrição, preço explicado e os anos
 * escolares como alvos grandes. Uma grade densa economiza rolagem e cobra o
 * preço em erro de leitura.
 */
export function EtapaEscolha({
  ctx,
  sessao,
  somenteLeitura,
  escritor,
  aoVoltar,
  aoAvancar,
  aoSalvar,
}: {
  ctx: ContextoPedido;
  sessao: Sessao;
  somenteLeitura: boolean;
  escritor: EscritorPedido;
  aoVoltar: () => void;
  aoAvancar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const linhas = useMemo(
    () => calcularLinhas(ctx, sessao.regionalId ?? ''),
    [ctx, sessao.regionalId],
  );

  const [indice, setIndice] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Seleção local: responde ao clique na hora, grava logo em seguida.
  const [marcados, setMarcados] = useState<Set<AnoEscolarId>>(new Set());
  const [recusado, setRecusado] = useState(false);
  const [creditosEscolhido, setCreditosEscolhido] = useState<number | null>(null);
  // Licenças ajustadas manualmente, ano a ano — ausente aqui segue a previsão.
  const [licencas, setLicencas] = useState<PrevisaoPorAno>({});
  const [ajustarLicencas, setAjustarLicencas] = useState(false);

  const atual: LinhaCalculada | undefined = linhas[indice];

  // Ao trocar de solução, carrega o que já estava decidido.
  useEffect(() => {
    if (!atual) return;
    const opcionaisMarcados = (atual.item?.anosSelecionados ?? []).filter((a) =>
      atual.habilitacao.opcionais.includes(a),
    );
    setMarcados(new Set(opcionaisMarcados));
    setRecusado(atual.item?.origem === 'recusado');
    setCreditosEscolhido(atual.item?.creditosPorAluno ?? null);

    // Só guarda o que realmente diverge da previsão — o resto segue normal.
    const divergentes: PrevisaoPorAno = {};
    for (const [ano, qtd] of Object.entries(atual.item?.alunosPorAno ?? {})) {
      const anoId = ano as AnoEscolarId;
      if (qtd !== (ctx.previsao[anoId] ?? 0)) divergentes[anoId] = qtd;
    }
    setLicencas(divergentes);
    setAjustarLicencas(Object.keys(divergentes).length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual]);

  const precisaEscolherCredito =
    !!atual &&
    atual.habilitacao.preco.base === 'credito' &&
    !recusado &&
    (atual.habilitacao.obrigatorios.length > 0 || marcados.size > 0);

  // Os anos que valem para esta solução agora — obrigatórios sempre, mais o
  // que foi marcado, na ordem pedagógica.
  const anosAtivos = useMemo(() => {
    if (!atual) return [];
    return recusado
      ? atual.habilitacao.obrigatorios
      : ordenarAnos([...atual.habilitacao.obrigatorios, ...marcados]);
  }, [atual, marcados, recusado]);

  const permiteLicencas =
    !!atual && (atual.habilitacao.preco.base === 'aluno' || atual.habilitacao.preco.base === 'credito');

  const previsaoEfetiva = useMemo(
    () => aplicarLicencas(ctx.previsao, permiteLicencas ? licencas : undefined, anosAtivos),
    [ctx.previsao, permiteLicencas, licencas, anosAtivos],
  );

  const previa = useMemo(() => {
    if (!atual) return { alunos: 0, valorAnual: 0 };
    return calcularItem(atual.habilitacao.preco, previsaoEfetiva, anosAtivos, creditosEscolhido ?? undefined);
  }, [atual, anosAtivos, previsaoEfetiva, creditosEscolhido]);

  const alunosPrevistos = useMemo(
    () => anosAtivos.reduce((s, ano) => s + (ctx.previsao[ano] ?? 0), 0),
    [anosAtivos, ctx.previsao],
  );
  const licencasDivergem = permiteLicencas && previa.alunos !== alunosPrevistos;

  const totais = useMemo(() => somarTotais(linhas), [linhas]);
  const decididas = linhas.filter((l) => l.decidida).length;

  const gravar = useCallback(
    async (proximo: boolean) => {
      if (!atual || somenteLeitura) return;
      if (precisaEscolherCredito && !creditosEscolhido) {
        setErro('Escolha quantos créditos por aluno antes de continuar.');
        return;
      }
      setSalvando(true);
      setErro(null);
      try {
        const pedidoId = await escritor.abrirRascunho(ctx.ciclo, sessao);
        await escritor.salvarDecisao(
          pedidoId,
          atual.produto,
          atual.habilitacao,
          ctx.fornecedores.get(atual.produto.fornecedorId) ?? '',
          ctx.previsao,
          {
            anos: [...marcados],
            recusado,
            creditosPorAluno: creditosEscolhido ?? undefined,
            licencasPorAno: permiteLicencas && Object.keys(licencas).length > 0 ? licencas : undefined,
          },
        );
        await aoSalvar();
        if (proximo) {
          if (indice < linhas.length - 1) setIndice(indice + 1);
          else aoAvancar();
        }
      } catch {
        setErro('Não foi possível salvar esta decisão. Tente de novo.');
      } finally {
        setSalvando(false);
      }
    },
    [
      atual,
      ctx,
      sessao,
      escritor,
      marcados,
      recusado,
      creditosEscolhido,
      permiteLicencas,
      licencas,
      precisaEscolherCredito,
      indice,
      linhas.length,
      somenteLeitura,
      aoSalvar,
      aoAvancar,
    ],
  );

  if (ctx.previsao && Object.keys(ctx.previsao).length === 0) {
    return (
      <EstadoVazio
        icone={<span aria-hidden="true">👥</span>}
        titulo="Informe a previsão de alunos primeiro"
        descricao="Sem saber quantos alunos há em cada ano, não dá para calcular nada nem saber quais soluções fazem sentido para a sua unidade."
        acao={<Botao onClick={aoVoltar}>Voltar para a previsão</Botao>}
      />
    );
  }

  if (!atual) {
    return (
      <EstadoVazio
        icone={<span aria-hidden="true">📦</span>}
        titulo="Nenhuma solução habilitada para a sua unidade"
        descricao="A administração ainda não liberou soluções para os anos escolares que a sua unidade oferta nesta regional. Assim que liberar, elas aparecem aqui."
      />
    );
  }

  const { produto, habilitacao } = atual;
  const temObrigatorio = habilitacao.obrigatorios.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      {/* Lista lateral: dá para pular para qualquer solução e ver o que falta */}
      <Cartao className="h-fit gap-1 p-3">
        <span className="px-2 pb-1 font-mono text-[11px] tracking-wider text-gray-500 uppercase">
          {decididas} de {linhas.length} decididas
        </span>
        {linhas.map((l, i) => {
          const obrigatoria = l.habilitacao.obrigatorios.length > 0;
          return (
            <button
              key={l.produto.id}
              type="button"
              onClick={() => setIndice(i)}
              className={juntar(
                'flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                i === indice
                  ? 'bg-gray-100 font-medium text-gray-900'
                  : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              <span
                aria-hidden="true"
                className={juntar(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  obrigatoria
                    ? 'bg-orange-400'
                    : l.item
                      ? l.item.origem === 'recusado'
                        ? 'bg-gray-300'
                        : 'bg-green-500'
                      : 'border border-gray-300',
                )}
              />
              <span className="truncate">{l.produto.nome}</span>
            </button>
          );
        })}
      </Cartao>

      <div className="flex flex-col gap-5">
        <Cartao className="gap-4 p-6">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-brand">{produto.nome}</h2>
              {temObrigatorio ? (
                <Selo tom="marca">obrigatória</Selo>
              ) : (
                <Selo tom="neutro">opcional</Selo>
              )}
            </div>
            <span className="text-sm text-gray-500">
              {ctx.fornecedores.get(produto.fornecedorId)} · {produto.categoria}
            </span>
            {produto.descricao && (
              <p className="max-w-prose text-sm text-gray-500">{produto.descricao}</p>
            )}
            {produto.materialUrl && (
              <a
                href={produto.materialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm"
              >
                Ver material do fornecedor ↗
              </a>
            )}
            <span className="w-fit rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-xs text-brand">
              {descreverPreco(habilitacao.preco)}
            </span>
          </div>

          {temObrigatorio && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800">
              Esta solução é obrigatória para{' '}
              {habilitacao.obrigatorios.length === 1 ? 'o ano' : 'os anos'}{' '}
              {habilitacao.obrigatorios.join(', ')} nesta regional — já entra no pedido e não pode
              ser removida por aqui.
            </p>
          )}

          <fieldset
            disabled={somenteLeitura || recusado}
            className="flex flex-col gap-3 disabled:opacity-50"
          >
            <legend className="pb-1 text-sm font-medium text-gray-700">
              Em quais anos você quer contratar em {ctx.ciclo.anoAlvo}?
            </legend>

            {SEGMENTOS.map((seg) => {
              const anosSeg = anosDoSegmento(seg.id).filter(
                (a) =>
                  habilitacao.opcionais.includes(a.id) || habilitacao.obrigatorios.includes(a.id),
              );
              const ofertaSegmento = anosDoSegmento(seg.id).some(
                (a) => (ctx.previsao[a.id] ?? 0) > 0,
              );
              if (!ofertaSegmento) return null;

              return (
                <div key={seg.id} className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
                  <span className="text-sm text-gray-500">{seg.nome}</span>
                  {anosSeg.length === 0 ? (
                    <span className="text-sm text-gray-400 italic">
                      não habilitada para este segmento
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {anosSeg.map((ano) => {
                        const travado = habilitacao.obrigatorios.includes(ano.id);
                        const ligado = travado || marcados.has(ano.id);
                        return (
                          <button
                            key={ano.id}
                            type="button"
                            disabled={travado}
                            aria-pressed={ligado}
                            onClick={() =>
                              setMarcados((m) => {
                                const novo = new Set(m);
                                if (novo.has(ano.id)) novo.delete(ano.id);
                                else novo.add(ano.id);
                                return novo;
                              })
                            }
                            className={juntar(
                              'flex min-w-14 flex-col items-center gap-0.5 rounded-xl border px-3 py-1.5 transition-all duration-150',
                              travado
                                ? 'cursor-default border-orange-300 bg-orange-100'
                                : ligado
                                  ? 'border-brand-medium bg-brand-medium shadow-sm'
                                  : 'border-gray-200 bg-white hover:-translate-y-px hover:border-gray-300 hover:shadow-sm',
                            )}
                          >
                            <span
                              className={juntar(
                                'text-sm font-medium',
                                travado ? 'text-orange-800' : ligado ? 'text-white' : 'text-gray-700',
                              )}
                            >
                              {ano.curto}
                            </span>
                            <span
                              className={juntar(
                                'font-mono text-[10px] tabular-nums',
                                travado ? 'text-orange-700/80' : ligado ? 'text-white/75' : 'text-gray-400',
                              )}
                            >
                              {ctx.previsao[ano.id] ?? 0}
                            </span>
                          </button>
                        );
                      })}
                      {anosSeg.filter((a) => !habilitacao.obrigatorios.includes(a.id)).length >
                        1 && (
                        <Botao
                          type="button"
                          variante="fantasma"
                          tamanho="sm"
                          onClick={() =>
                            setMarcados((m) => {
                              const opcionaisSeg = anosSeg
                                .filter((a) => !habilitacao.obrigatorios.includes(a.id))
                                .map((a) => a.id);
                              const todos = opcionaisSeg.every((a) => m.has(a));
                              const novo = new Set(m);
                              for (const a of opcionaisSeg) {
                                if (todos) novo.delete(a);
                                else novo.add(a);
                              }
                              return novo;
                            })
                          }
                        >
                          todo o segmento
                        </Botao>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>

          {habilitacao.preco.base === 'escola' && (
            <p className="text-xs text-gray-500">
              Cobrança por unidade: marcar mais anos escolares não altera o valor.
            </p>
          )}

          {permiteLicencas && anosAtivos.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3.5">
              <button
                type="button"
                onClick={() => setAjustarLicencas((v) => !v)}
                aria-expanded={ajustarLicencas}
                className="flex flex-wrap items-center gap-2 text-left text-sm font-medium text-gray-700"
              >
                <span aria-hidden="true" className="w-3 text-xs text-gray-400">
                  {ajustarLicencas ? '▾' : '▸'}
                </span>
                Ajustar quantidade de licenças
                {licencasDivergem && <Selo tom="atencao">diferente da previsão</Selo>}
              </button>

              {ajustarLicencas && (
                <div className="flex flex-col gap-2.5 pl-5">
                  <p className="text-xs text-gray-500">
                    Por padrão a quantidade de licenças segue a previsão de alunos. Mude aqui só se
                    esta solução cobrir menos — ou mais — alunos do que o total matriculado no ano.
                  </p>
                  <fieldset disabled={somenteLeitura} className="flex flex-col gap-2">
                    {anosAtivos.map((ano) => {
                      const previsaoAno = ctx.previsao[ano] ?? 0;
                      const valor = licencas[ano] ?? previsaoAno;
                      const divergente = licencas[ano] !== undefined && licencas[ano] !== previsaoAno;
                      return (
                        <div key={ano} className="flex flex-wrap items-center gap-2.5">
                          <span className="w-28 shrink-0 text-sm text-gray-600">
                            {anoEscolar(ano).nome}
                          </span>
                          <Entrada
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={valor}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              const limpo = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
                              setLicencas((l) => ({ ...l, [ano]: limpo }));
                            }}
                            className="max-w-24"
                            aria-label={`Licenças de ${anoEscolar(ano).nome}`}
                          />
                          <span className="font-mono text-xs text-gray-400 tabular-nums">
                            previsão: {previsaoAno}
                          </span>
                          {divergente && !somenteLeitura && (
                            <button
                              type="button"
                              onClick={() =>
                                setLicencas((l) => {
                                  const copia = { ...l };
                                  delete copia[ano];
                                  return copia;
                                })
                              }
                              className="text-xs text-brand-medium hover:underline"
                            >
                              usar previsão
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </fieldset>
                </div>
              )}
            </div>
          )}

          {licencasDivergem && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800">
              Você está contratando licenças para <strong>{previa.alunos}</strong> aluno
              {previa.alunos === 1 ? '' : 's'} — a previsão para os anos marcados soma{' '}
              <strong>{alunosPrevistos}</strong>.
            </p>
          )}

          {habilitacao.preco.base === 'credito' && !recusado && (
            <fieldset disabled={somenteLeitura} className="flex flex-col gap-2 disabled:opacity-50">
              <legend className="pb-1 text-sm font-medium text-gray-700">
                Quantos créditos por aluno?
              </legend>
              <p className="text-xs text-gray-500">
                Serviço como este não cobra 1 crédito por aluno necessariamente — a rede negociou
                faixas. {previa.alunos} aluno{previa.alunos === 1 ? '' : 's'} nos anos marcados.
              </p>
              <div className="flex flex-wrap gap-2">
                {(habilitacao.preco.opcoesCredito ?? []).map((multiplo) => {
                  const ligado = creditosEscolhido === multiplo;
                  return (
                    <button
                      key={multiplo}
                      type="button"
                      aria-pressed={ligado}
                      onClick={() => setCreditosEscolhido(multiplo)}
                      className={juntar(
                        'h-11 min-w-16 rounded-lg border px-3 text-sm transition-colors',
                        ligado
                          ? 'border-brand-medium bg-brand-medium font-medium text-white'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400',
                      )}
                    >
                      {rotularMultiploCredito(multiplo)}
                    </button>
                  );
                })}
              </div>
              {creditosEscolhido && (
                <span className="text-xs text-gray-500">
                  {rotularMultiploCredito(creditosEscolhido)} × {previa.alunos} alunos ={' '}
                  {Math.round(previa.alunos * creditosEscolhido)} créditos
                </span>
              )}
            </fieldset>
          )}

          {!temObrigatorio && !somenteLeitura && (
            <label className="flex items-center gap-2.5 rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={recusado}
                onChange={(e) => {
                  setRecusado(e.target.checked);
                  if (e.target.checked) setMarcados(new Set());
                }}
                className="h-4 w-4 accent-[var(--color-brand-medium)]"
              />
              Não contratar esta solução em {ctx.ciclo.anoAlvo}
            </label>
          )}
        </Cartao>

        {erro && (
          <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
            {erro}
          </p>
        )}

        <Cartao className="flex-row flex-wrap items-center gap-5 p-4">
          <div className="flex flex-col">
            <span className="text-xs tracking-wide text-gray-500 uppercase">Alunos</span>
            <span className="font-mono text-sm font-medium tabular-nums">{previa.alunos}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs tracking-wide text-gray-500 uppercase">Esta solução / ano</span>
            <span className="font-mono text-sm font-medium tabular-nums">
              {formatarBRL(previa.valorAnual)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs tracking-wide text-gray-500 uppercase">Total até aqui</span>
            <span className="font-mono text-base font-semibold text-brand tabular-nums">
              {formatarBRL(totais.total)}
            </span>
          </div>

          <div className="flex-1" />

          <Botao
            variante="secundario"
            onClick={() => (indice > 0 ? setIndice(indice - 1) : aoVoltar())}
            disabled={salvando}
          >
            Voltar
          </Botao>
          {somenteLeitura ? (
            <Botao onClick={aoAvancar}>Ver o mapa</Botao>
          ) : (
            <Botao
              carregando={salvando}
              disabled={precisaEscolherCredito && !creditosEscolhido}
              onClick={() => void gravar(true)}
            >
              {indice < linhas.length - 1 ? 'Próxima solução' : 'Ver o mapa'}
            </Botao>
          )}
        </Cartao>
      </div>
    </div>
  );
}
