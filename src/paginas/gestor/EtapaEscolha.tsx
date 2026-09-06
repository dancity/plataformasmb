import { useCallback, useEffect, useMemo, useState } from 'react';
import { Botao, Cartao, Entrada, EstadoVazio, Selo, juntar } from '@/componentes/ui';
import type { Sessao } from '@/lib/auth';
import { calcularLinhas, somarTotais } from '@/lib/pedido';
import type { ContextoPedido, EscritorPedido, LinhaCalculada } from '@/lib/pedido';
import { SEGMENTOS, anoEscolar, anosDoSegmento, aplicarLicencas, ordenarAnos } from '@dominio/anosEscolares';
import type { AnoEscolarId, PrevisaoPorAno } from '@dominio/anosEscolares';
import { calcularItem, descreverPreco, formatarBRL } from '@dominio/preco';

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
  // Créditos digitados em cada ano — ano ausente ainda não decidiu (0 é uma
  // escolha válida, ausência não é).
  const [creditosPorAno, setCreditosPorAno] = useState<PrevisaoPorAno>({});
  // Texto do "Nx por aluno" de cada ano — espelha creditosPorAno, mas como
  // string própria pra não brigar com o cursor enquanto a pessoa digita um
  // decimal (0,5). Atualiza sozinho quando os créditos mudam por outra via.
  const [multiplicadores, setMultiplicadores] = useState<Partial<Record<AnoEscolarId, string>>>({});
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
    const creditos = atual.item?.creditosPorAno ?? {};
    setCreditosPorAno(creditos);
    const multiplicadoresIniciais: Partial<Record<AnoEscolarId, string>> = {};
    for (const [ano, qtd] of Object.entries(creditos)) {
      const anoId = ano as AnoEscolarId;
      const previsaoAno = ctx.previsao[anoId] ?? 0;
      if (previsaoAno > 0) {
        multiplicadoresIniciais[anoId] = (qtd / previsaoAno).toLocaleString('pt-BR', {
          maximumFractionDigits: 4,
        });
      }
    }
    setMultiplicadores(multiplicadoresIniciais);

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

  // Os anos que valem para esta solução agora — obrigatórios sempre, mais o
  // que foi marcado, na ordem pedagógica.
  const anosAtivos = useMemo(() => {
    if (!atual) return [];
    return recusado
      ? atual.habilitacao.obrigatorios
      : ordenarAnos([...atual.habilitacao.obrigatorios, ...marcados]);
  }, [atual, marcados, recusado]);

  // Falta digitar a quantidade de créditos de pelo menos um ano ativo — não
  // dá para seguir sem isso, porque não é número que o catálogo infira
  // sozinho. Zero é uma escolha válida; ausência não é.
  const precisaEscolherCredito =
    !!atual &&
    atual.habilitacao.preco.base === 'credito' &&
    !recusado &&
    anosAtivos.some((ano) => creditosPorAno[ano] === undefined);

  // Licença ajustada manualmente só faz sentido quando o preço é por aluno:
  // em crédito a quantidade já é digitada direto, ano a ano.
  const permiteLicencas = !!atual && atual.habilitacao.preco.base === 'aluno';

  const previsaoEfetiva = useMemo(
    () => aplicarLicencas(ctx.previsao, permiteLicencas ? licencas : undefined, anosAtivos),
    [ctx.previsao, permiteLicencas, licencas, anosAtivos],
  );

  const previa = useMemo(() => {
    if (!atual) return { alunos: 0, creditos: 0, valorAnual: 0 };
    return calcularItem(atual.habilitacao.preco, previsaoEfetiva, anosAtivos, creditosPorAno);
  }, [atual, anosAtivos, previsaoEfetiva, creditosPorAno]);

  const alunosPrevistos = useMemo(
    () => anosAtivos.reduce((s, ano) => s + (ctx.previsao[ano] ?? 0), 0),
    [anosAtivos, ctx.previsao],
  );
  const licencasDivergem = permiteLicencas && previa.alunos !== alunosPrevistos;

  const totais = useMemo(() => somarTotais(linhas), [linhas]);
  const decididas = linhas.filter((l) => l.decidida).length;

  // Pra onde ir depois de gravar — índice de outra solução (clique na lista
  // lateral inclusive), a etapa seguinte (mapa) ou a etapa anterior
  // (previsão). null significa "só grava, sem navegar".
  type Destino = number | 'avancar' | 'voltar' | null;

  const gravar = useCallback(
    async (destino: Destino) => {
      const navegar = () => {
        if (destino === null) return;
        if (typeof destino === 'number') setIndice(destino);
        else if (destino === 'avancar') aoAvancar();
        else aoVoltar();
      };

      // Sem nada pra gravar (etapa fechada ou pedido já enviado) — só navega.
      if (!atual || somenteLeitura) {
        navegar();
        return;
      }
      if (precisaEscolherCredito) {
        setErro('Digite a quantidade de créditos de cada ano marcado antes de continuar.');
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
            creditosPorAno: Object.keys(creditosPorAno).length > 0 ? creditosPorAno : undefined,
            licencasPorAno: permiteLicencas && Object.keys(licencas).length > 0 ? licencas : undefined,
          },
        );
        await aoSalvar();
        navegar();
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
      creditosPorAno,
      permiteLicencas,
      licencas,
      precisaEscolherCredito,
      somenteLeitura,
      aoSalvar,
      aoAvancar,
      aoVoltar,
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
              disabled={salvando}
              onClick={() => void gravar(i)}
              className={juntar(
                'flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
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

          {habilitacao.preco.base === 'credito' && !recusado && anosAtivos.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3.5">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">
                  Quantos créditos em cada ano?
                </span>
                <p className="text-xs text-gray-500">
                  Serviço como este pode gastar números diferentes por ano — por exemplo, mais
                  redações corrigidas na 3ª série do médio do que no fundamental. Digite a
                  quantidade de créditos de cada ano marcado.
                </p>
              </div>

              <fieldset disabled={somenteLeitura} className="disabled:opacity-50">
                <table className="w-full table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="w-[34%] py-1.5 pr-2 text-left font-medium">Ano escolar</th>
                      <th className="w-[22%] px-2 py-1.5 text-right font-medium">Nº de alunos</th>
                      <th className="w-[20%] px-2 py-1.5 text-center font-medium">Multiplicador</th>
                      <th className="w-[24%] pl-2 py-1.5 text-right font-medium">Nº de créditos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anosAtivos.map((ano) => {
                      const previsaoAno = ctx.previsao[ano] ?? 0;
                      const valor = creditosPorAno[ano];
                      const textoMultiplicador = multiplicadores[ano] ?? '';

                      function definirCreditos(novoValor: number) {
                        const limpo = Math.max(0, Math.round(novoValor));
                        setCreditosPorAno((c) => ({ ...c, [ano]: limpo }));
                        setMultiplicadores((m) => ({
                          ...m,
                          [ano]:
                            previsaoAno > 0
                              ? (limpo / previsaoAno).toLocaleString('pt-BR', {
                                  maximumFractionDigits: 4,
                                })
                              : '',
                        }));
                      }

                      return (
                        <tr key={ano} className="border-b border-gray-100 last:border-b-0">
                          <td className="py-1.5 pr-2 text-sm text-gray-700">
                            {anoEscolar(ano).nome}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-500 tabular-nums">
                            {previsaoAno}
                          </td>
                          <td className="px-2 py-1.5">
                            <Entrada
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              disabled={previsaoAno === 0}
                              value={textoMultiplicador}
                              onChange={(e) => {
                                const texto = e.target.value;
                                setMultiplicadores((m) => ({ ...m, [ano]: texto }));
                                const n = Number(texto);
                                if (texto !== '' && Number.isFinite(n) && previsaoAno > 0) {
                                  setCreditosPorAno((c) => ({
                                    ...c,
                                    [ano]: Math.max(0, Math.round(previsaoAno * n)),
                                  }));
                                }
                              }}
                              className="mx-auto max-w-10 [appearance:textfield] px-1 py-1 text-center text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              aria-label={`Multiplicador por aluno de ${anoEscolar(ano).nome}`}
                            />
                          </td>
                          <td className="pl-2 py-1.5">
                            <Entrada
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={valor ?? ''}
                              placeholder="—"
                              onChange={(e) => {
                                const texto = e.target.value;
                                if (texto === '') {
                                  setCreditosPorAno((c) => {
                                    const copia = { ...c };
                                    delete copia[ano];
                                    return copia;
                                  });
                                  setMultiplicadores((m) => {
                                    const copia = { ...m };
                                    delete copia[ano];
                                    return copia;
                                  });
                                  return;
                                }
                                const n = Number(texto);
                                if (Number.isFinite(n)) definirCreditos(n);
                              }}
                              className="ml-auto max-w-24 text-right"
                              aria-label={`Créditos de ${anoEscolar(ano).nome}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </fieldset>

              <span className="text-sm font-medium text-gray-700">
                Total: <span className="font-mono tabular-nums">{previa.creditos}</span> créditos
                nesta solução
              </span>
            </div>
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
            carregando={salvando}
            onClick={() => void gravar(indice > 0 ? indice - 1 : 'voltar')}
          >
            Voltar
          </Botao>
          {somenteLeitura ? (
            <Botao onClick={aoAvancar}>Ver o mapa</Botao>
          ) : (
            <Botao
              carregando={salvando}
              disabled={precisaEscolherCredito}
              onClick={() => void gravar(indice < linhas.length - 1 ? indice + 1 : 'avancar')}
            >
              {indice < linhas.length - 1 ? 'Próxima solução' : 'Ver o mapa'}
            </Botao>
          )}
        </Cartao>
      </div>
    </div>
  );
}
