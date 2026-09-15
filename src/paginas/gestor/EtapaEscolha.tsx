import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarraProgresso,
  Botao,
  BotaoLink,
  Cartao,
  Entrada,
  EstadoVazio,
  IconeCadeado,
  LogoFornecedor,
  Selo,
  juntar,
} from "@/componentes/ui";
import type { Sessao } from "@/lib/auth";
import { calcularLinhas, somarTotais } from "@/lib/pedido";
import { descreverBloqueio } from "@dominio/vinculos";
import type {
  ContextoPedido,
  EscritorPedido,
  LinhaCalculada,
} from "@/lib/pedido";
import {
  SEGMENTOS,
  anoEscolar,
  anosDoSegmento,
  aplicarLicencas,
  ordenarAnos,
} from "@dominio/anosEscolares";
import type { AnoEscolarId, PrevisaoPorAno } from "@dominio/anosEscolares";
import { calcularItem, descreverPreco, formatarBRL } from "@dominio/preco";
import {
  CATEGORIA_AVALIACAO_LARGA_ESCALA,
  CATEGORIA_REDACAO,
} from "@dominio/tipos";

/**
 * Etapa 3 — soluções adicionais, uma de cada vez.
 *
 * Tudo o que não é avaliação em larga escala (essa é a etapa 2, por modelo)
 * mora aqui. Cada decisão ganha um bloco próprio: quem fornece, onde
 * contratar, quanto usar. Uma tela só, densa e sem separação, economiza
 * rolagem e cobra o preço em erro de leitura.
 */

/** Aceita "1,5" e "1.5" — quem digita não deveria adivinhar o separador. */
function numeroDeTexto(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === "") return null;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function textoDoMultiplicador(creditos: number, alunos: number): string {
  if (alunos <= 0) return "";
  return (creditos / alunos).toLocaleString("pt-BR", {
    maximumFractionDigits: 4,
  });
}

function IconeExterno() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 4h6v6" />
        <path d="M20 4l-8 8" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </g>
    </svg>
  );
}

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
    () =>
      calcularLinhas(ctx).filter(
        (l) => l.produto.categoria !== CATEGORIA_AVALIACAO_LARGA_ESCALA,
      ),
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
  // Texto do "por aluno" de cada ano — espelha creditosPorAno, mas como
  // string própria pra não brigar com o cursor enquanto a pessoa digita um
  // decimal (0,5). Atualiza sozinho quando os créditos mudam por outra via.
  const [multiplicadores, setMultiplicadores] = useState<
    Partial<Record<AnoEscolarId, string>>
  >({});
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
    setRecusado(atual.item?.origem === "recusado");
    const creditos = atual.item?.creditosPorAno ?? {};
    setCreditosPorAno(creditos);
    const multiplicadoresIniciais: Partial<Record<AnoEscolarId, string>> = {};
    for (const [ano, qtd] of Object.entries(creditos)) {
      const anoId = ano as AnoEscolarId;
      const texto = textoDoMultiplicador(qtd ?? 0, ctx.previsao[anoId] ?? 0);
      if (texto) multiplicadoresIniciais[anoId] = texto;
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
    atual.habilitacao.preco.base === "credito" &&
    !recusado &&
    anosAtivos.some((ano) => creditosPorAno[ano] === undefined);

  // Licença ajustada manualmente só faz sentido quando o preço é por aluno:
  // em crédito a quantidade já é digitada direto, ano a ano.
  const permiteLicencas = !!atual && atual.habilitacao.preco.base === "aluno";

  const previsaoEfetiva = useMemo(
    () =>
      aplicarLicencas(
        ctx.previsao,
        permiteLicencas ? licencas : undefined,
        anosAtivos,
      ),
    [ctx.previsao, permiteLicencas, licencas, anosAtivos],
  );

  const previa = useMemo(() => {
    if (!atual) return { alunos: 0, creditos: 0, valorAnual: 0 };
    return calcularItem(
      atual.habilitacao.preco,
      previsaoEfetiva,
      anosAtivos,
      creditosPorAno,
    );
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
  type Destino = number | "avancar" | "voltar" | null;

  const gravar = useCallback(
    async (destino: Destino) => {
      const navegar = () => {
        if (destino === null) return;
        if (typeof destino === "number") setIndice(destino);
        else if (destino === "avancar") aoAvancar();
        else aoVoltar();
      };

      // Sem nada pra gravar (etapa fechada, pedido enviado, ou solução travada
      // por pré-requisito) — só navega. Item que já existia e ficou travado
      // depois cai no envio, no servidor; não é o passeio do gestor pela lista
      // que decide isso.
      if (!atual || somenteLeitura || atual.bloqueio) {
        navegar();
        return;
      }
      if (precisaEscolherCredito) {
        setErro("Digite a quantidade de cada ano marcado antes de continuar.");
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
          ctx.fornecedores.get(atual.produto.fornecedorId)?.nome ?? "",
          ctx.previsao,
          {
            anos: [...marcados],
            recusado,
            creditosPorAno:
              Object.keys(creditosPorAno).length > 0
                ? creditosPorAno
                : undefined,
            licencasPorAno:
              permiteLicencas && Object.keys(licencas).length > 0
                ? licencas
                : undefined,
          },
        );
        await aoSalvar();
        navegar();
      } catch {
        setErro("Não foi possível salvar esta decisão. Tente de novo.");
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
        titulo="Nenhuma solução disponível para a sua unidade"
        descricao="A administração ainda não liberou soluções para os anos escolares que a sua unidade oferta. Assim que liberar, elas aparecem aqui."
      />
    );
  }

  const { produto, habilitacao, bloqueio } = atual;
  const fornecedor = ctx.fornecedores.get(produto.fornecedorId);
  const temObrigatorio = habilitacao.obrigatorios.length > 0;
  const porCredito = habilitacao.preco.base === "credito";
  const ehRedacao = produto.categoria === CATEGORIA_REDACAO;
  // Cobrança por unidade não conta licença: o número ali é quanta gente a
  // solução alcança, não quanta coisa foi comprada.
  const rotuloQuantidade =
    habilitacao.preco.base === "escola" ? "aluno" : "licença";

  // A categoria Redação troca o vocabulário da tela de crédito: quem compra
  // pensa em redação corrigida por aluno, não em crédito.
  const textosCredito = ehRedacao
    ? {
        titulo: "Quantas redações corrigidas em cada ano?",
        descricao:
          "Cada aluno pode ter mais de uma redação corrigida no ano — normalmente mais na 3ª série do médio do que no fundamental. Diga quantas por aluno ou o total do ano: preencher um calcula o outro.",
        colunaMultiplicador: "por aluno",
        colunaTotal: "Total de redações no ano",
        unidade: "redações corrigidas",
      }
    : {
        titulo: "Quantos créditos em cada ano?",
        descricao:
          "Serviço como este pode gastar números diferentes por ano. Diga quantos créditos por aluno ou o total do ano: preencher um calcula o outro.",
        colunaMultiplicador: "Multiplicador",
        colunaTotal: "Nº de créditos",
        unidade: "créditos",
      };

  // Segmentos que a unidade oferta, separados entre os que esta solução
  // atende e os que não — os de fora viram uma linha só no rodapé, não duas
  // fileiras de texto cinza no meio da escolha.
  const segmentosOfertados = SEGMENTOS.filter((seg) =>
    anosDoSegmento(seg.id).some((a) => (ctx.previsao[a.id] ?? 0) > 0),
  );
  const segmentosComAnos = segmentosOfertados
    .map((seg) => ({
      seg,
      anos: anosDoSegmento(seg.id).filter(
        (a) =>
          habilitacao.opcionais.includes(a.id) ||
          habilitacao.obrigatorios.includes(a.id),
      ),
    }))
    .filter((s) => s.anos.length > 0);
  const segmentosDeFora = segmentosOfertados.filter(
    (seg) => !segmentosComAnos.some((s) => s.seg.id === seg.id),
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[264px_1fr]">
      {/* A jornada: onde a pessoa está, o que já decidiu, o que falta. */}
      <Cartao className="h-fit gap-3 p-4">
        <div className="flex flex-col gap-2 px-1">
          <span className="font-mono text-[11px] tracking-wider text-gray-500 uppercase">
            {decididas} de {linhas.length} decididas
          </span>
          <BarraProgresso valor={decididas} total={linhas.length} />
        </div>

        <ol className="relative flex flex-col">
          {/* Trilha contínua ligando os pontos. Fica antes dos botões no DOM
              e sem z-index: como eles também são `relative`, pintam por cima
              dela — a linha aparece só no vão entre um ponto e outro. */}
          <span
            aria-hidden="true"
            className="absolute top-4 bottom-4 left-[14px] w-px bg-gray-200"
          />
          {linhas.map((l, i) => {
            const obrigatoria = l.habilitacao.obrigatorios.length > 0;
            const recusadaAqui = l.item?.origem === "recusado";
            return (
              <li key={l.produto.id}>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => void gravar(i)}
                  aria-current={i === indice ? "step" : undefined}
                  className={juntar(
                    "relative flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    i === indice
                      ? "bg-gray-100 font-medium text-gray-900"
                      : "text-gray-500 hover:bg-gray-100",
                  )}
                >
                  {/* Travada mostra cadeado, não bolinha: é a única da lista
                      em que não há decisão a tomar, e forma comunica isso
                      sem depender de distinguir mais um tom de cinza. */}
                  {l.bloqueio ? (
                    <IconeCadeado />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={juntar(
                        "h-3 w-3 shrink-0 rounded-full",
                        obrigatoria
                          ? "bg-orange-400"
                          : l.item
                            ? recusadaAqui
                              ? "bg-gray-300"
                              : "bg-green-500"
                            : "border-2 border-gray-300 bg-white",
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {l.produto.nome}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Cartao>

      <div className="flex flex-col gap-4">
        {/* Quem é a solução: nome, quem fornece, o que é, quanto custa. */}
        {/* Marca à esquerda, o resto numa coluna só: descrição e preço
            alinham com o nome da solução, não com a borda do cartão. */}
        <Cartao className="flex-row items-start gap-4 p-6">
          <LogoFornecedor
            nome={fornecedor?.nome ?? "?"}
            logo={fornecedor?.logo}
            tamanho="lg"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-brand">
                    {produto.nome}
                  </h2>
                  {/* Travada não é "opcional": dizer opcional ao lado de
                      "depende de outra contratação" faz o leitor parar pra
                      resolver a contradição. */}
                  {bloqueio ? (
                    <Selo tom="neutro">travada</Selo>
                  ) : temObrigatorio ? (
                    <Selo tom="marca">obrigatória</Selo>
                  ) : (
                    <Selo tom="neutro">opcional</Selo>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  Fornecido por:{" "}
                  <span className="font-medium text-gray-700">
                    {fornecedor?.nome ?? "—"}
                  </span>
                </span>
              </div>

              {produto.materialUrl && (
                <BotaoLink
                  variante="secundario"
                  tamanho="sm"
                  href={produto.materialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Saiba mais
                  <IconeExterno />
                </BotaoLink>
              )}
            </div>

            {produto.descricao && (
              <p className="max-w-prose text-sm text-gray-500">
                {produto.descricao}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <span className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-xs text-brand">
                {descreverPreco(habilitacao.preco)}
              </span>
              {ctx.unidade.tipo === "social" &&
                produto.precoSocialHabilitado && (
                  <Selo tom="ok">preço social da sua unidade</Selo>
                )}
              {habilitacao.preco.base === "escola" && (
                <span className="text-xs text-gray-500">
                  Cobrança por unidade: marcar mais anos não altera o valor.
                </span>
              )}
            </div>
          </div>
        </Cartao>

        {temObrigatorio && !bloqueio && (
          <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
            Obrigatória para{" "}
            {habilitacao.obrigatorios.length === 1 ? "o ano" : "os anos"}{" "}
            {habilitacao.obrigatorios.map((a) => anoEscolar(a).nome).join(", ")}{" "}
            — já entra no pedido e não pode ser removida por aqui.
          </p>
        )}

        {/* Travada por pré-requisito: a solução continua na tela, com o
            motivo e o caminho pra destravar. Sumir seria mais simples e
            deixaria a unidade sem saber que ela existe. */}
        {bloqueio && (
          <Cartao className="gap-3 border-dashed p-6">
            <div className="flex items-center gap-2.5">
              <IconeCadeado />
              <h3 className="text-sm font-semibold text-gray-700">
                Esta solução depende de outra contratação
              </h3>
            </div>
            <p className="max-w-prose text-sm text-gray-500">
              {descreverBloqueio(
                bloqueio,
                (id: string) => ctx.modelos.find((m) => m.id === id)?.nome,
                (id: string) => ctx.produtos.find((pr) => pr.id === id)?.nome,
              )}{" "}
              Enquanto isso, não há o que decidir aqui — e ela não segura o
              envio do pedido.
            </p>
            {bloqueio.modelos.length > 0 && (
              <Botao
                variante="secundario"
                tamanho="sm"
                className="w-fit"
                onClick={aoVoltar}
              >
                Ver os modelos
              </Botao>
            )}
          </Cartao>
        )}

        {/* Tudo que é decisão só existe quando há decisão a tomar. Numa
            solução travada, o seletor de anos apareceria clicável e sem
            efeito nenhum — pior que não aparecer. */}
        {!bloqueio && (
          <>
            {/* Onde contratar. */}
            <Cartao className="gap-0 p-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 px-6 py-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  Em quais anos você quer contratar em {ctx.ciclo.anoAlvo}?
                </h3>
                <span className="font-mono text-xs text-gray-500 tabular-nums">
                  {anosAtivos.length} ano{anosAtivos.length === 1 ? "" : "s"} ·{" "}
                  {previa.alunos} {rotuloQuantidade}
                  {previa.alunos === 1 ? "" : "s"}
                </span>
              </div>

              <fieldset
                disabled={somenteLeitura || recusado}
                className="flex flex-col divide-y divide-gray-100 disabled:opacity-50"
              >
                {segmentosComAnos.map(({ seg, anos: anosSeg }) => {
                  const opcionaisDoSegmento = anosSeg.filter(
                    (a) => !habilitacao.obrigatorios.includes(a.id),
                  );
                  const todosMarcados =
                    opcionaisDoSegmento.length > 0 &&
                    opcionaisDoSegmento.every((a) => marcados.has(a.id));
                  return (
                    <div
                      key={seg.id}
                      className="grid gap-2 px-6 py-4 sm:grid-cols-[9.5rem_1fr] sm:items-center"
                    >
                      <span className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                        {seg.nome}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {anosSeg.map((ano) => {
                          const travado = habilitacao.obrigatorios.includes(
                            ano.id,
                          );
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
                                "flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-xl border px-3 py-2 transition-all duration-150",
                                travado
                                  ? "cursor-default border-orange-300 bg-orange-100"
                                  : ligado
                                    ? "border-brand-medium bg-brand-medium shadow-sm"
                                    : "border-gray-200 bg-white hover:-translate-y-px hover:border-gray-300 hover:shadow-sm",
                              )}
                            >
                              <span
                                className={juntar(
                                  "text-sm font-medium",
                                  travado
                                    ? "text-orange-800"
                                    : ligado
                                      ? "text-white"
                                      : "text-gray-700",
                                )}
                              >
                                {ano.curto}
                              </span>
                              <span
                                className={juntar(
                                  "font-mono text-[10px] tabular-nums",
                                  travado
                                    ? "text-orange-700/80"
                                    : ligado
                                      ? "text-white/75"
                                      : "text-gray-400",
                                )}
                              >
                                {ctx.previsao[ano.id] ?? 0}
                              </span>
                            </button>
                          );
                        })}

                        {opcionaisDoSegmento.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setMarcados((m) => {
                                const novo = new Set(m);
                                for (const a of opcionaisDoSegmento) {
                                  if (todosMarcados) novo.delete(a.id);
                                  else novo.add(a.id);
                                }
                                return novo;
                              })
                            }
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-medium transition-colors hover:bg-gray-100"
                          >
                            {todosMarcados
                              ? "limpar segmento"
                              : "todo o segmento"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </fieldset>

              {segmentosDeFora.length > 0 && (
                <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">
                  Não disponível para{" "}
                  {segmentosDeFora.map((s) => s.nome).join(", ")}.
                </p>
              )}
            </Cartao>

            {/* Quanto usar — só para cobrança por crédito. */}
            {porCredito && !recusado && anosAtivos.length > 0 && (
              <Cartao className="gap-0 p-0">
                <div className="flex flex-col gap-1 border-b border-gray-200 px-6 py-4">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {textosCredito.titulo}
                  </h3>
                  <p className="max-w-prose text-xs text-gray-500">
                    {textosCredito.descricao}
                  </p>
                </div>

                <fieldset
                  disabled={somenteLeitura}
                  className="px-6 py-2 disabled:opacity-50"
                >
                  <table className="w-full table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs text-gray-500">
                        <th className="w-[30%] py-2 pr-2 text-left font-medium">
                          Ano escolar
                        </th>
                        <th className="w-[18%] px-2 py-2 text-right font-medium">
                          Nº de alunos
                        </th>
                        <th className="w-[22%] px-2 py-2 text-center font-medium">
                          {textosCredito.colunaMultiplicador}
                        </th>
                        <th className="w-[30%] py-2 pl-2 text-right font-medium">
                          {textosCredito.colunaTotal}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {anosAtivos.map((ano) => {
                        const previsaoAno = ctx.previsao[ano] ?? 0;
                        const valor = creditosPorAno[ano];
                        const textoMultiplicador = multiplicadores[ano] ?? "";

                        return (
                          <tr
                            key={ano}
                            className="border-b border-gray-100 last:border-b-0"
                          >
                            <td className="py-2 pr-2 text-sm text-gray-700">
                              {anoEscolar(ano).nome}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-xs text-gray-500 tabular-nums">
                              {previsaoAno}
                            </td>
                            <td className="px-2 py-2">
                              {/* O input é inline: sem este wrapper, `mx-auto`
                                não centraliza nada e a coluna sai torta em
                                relação ao cabeçalho. */}
                              <div className="mx-auto w-16">
                                <Entrada
                                  type="text"
                                  inputMode="decimal"
                                  disabled={previsaoAno === 0}
                                  value={textoMultiplicador}
                                  placeholder="—"
                                  onChange={(e) => {
                                    const texto = e.target.value;
                                    setMultiplicadores((m) => ({
                                      ...m,
                                      [ano]: texto,
                                    }));
                                    const n = numeroDeTexto(texto);
                                    if (n !== null && previsaoAno > 0) {
                                      setCreditosPorAno((c) => ({
                                        ...c,
                                        [ano]: Math.max(
                                          0,
                                          Math.round(previsaoAno * n),
                                        ),
                                      }));
                                    }
                                  }}
                                  className="px-1 py-1.5 text-center"
                                  aria-label={`${textosCredito.colunaMultiplicador} em ${anoEscolar(ano).nome}`}
                                />
                              </div>
                            </td>
                            <td className="py-2 pl-2">
                              <div className="ml-auto w-24">
                                <Entrada
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  value={valor ?? ""}
                                  placeholder="—"
                                  onChange={(e) => {
                                    const texto = e.target.value;
                                    if (texto === "") {
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
                                    if (!Number.isFinite(n)) return;
                                    // Digitar o total preenche o "por aluno" —
                                    // os dois campos são a mesma decisão vista
                                    // de dois jeitos, nenhum é o principal.
                                    const limpo = Math.max(0, Math.round(n));
                                    setCreditosPorAno((c) => ({
                                      ...c,
                                      [ano]: limpo,
                                    }));
                                    setMultiplicadores((m) => ({
                                      ...m,
                                      [ano]: textoDoMultiplicador(
                                        limpo,
                                        previsaoAno,
                                      ),
                                    }));
                                  }}
                                  className="py-1.5 text-right"
                                  aria-label={`${textosCredito.colunaTotal} em ${anoEscolar(ano).nome}`}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </fieldset>

                <div className="flex flex-wrap items-baseline gap-x-2 border-t border-gray-200 px-6 py-3">
                  <span className="text-sm font-medium text-gray-700">
                    Total:{" "}
                    <span className="font-mono tabular-nums">
                      {previa.creditos}
                    </span>{" "}
                    {textosCredito.unidade}
                  </span>
                  {ehRedacao && (
                    <span className="text-xs text-gray-500">
                      — {previa.creditos} crédito
                      {previa.creditos === 1 ? "" : "s"} nesta solução
                    </span>
                  )}
                </div>
              </Cartao>
            )}

            {/* Quantas licenças — só para cobrança por aluno. */}
            {permiteLicencas && anosAtivos.length > 0 && (
              <Cartao className="gap-0 p-0">
                <button
                  type="button"
                  onClick={() => setAjustarLicencas((v) => !v)}
                  aria-expanded={ajustarLicencas}
                  className="flex flex-wrap items-center gap-2 px-6 py-4 text-left text-sm font-semibold text-gray-700"
                >
                  <span
                    aria-hidden="true"
                    className="w-3 text-xs text-gray-400"
                  >
                    {ajustarLicencas ? "▾" : "▸"}
                  </span>
                  Ajustar quantidade de licenças
                  {licencasDivergem && (
                    <Selo tom="atencao">diferente da previsão</Selo>
                  )}
                </button>

                {ajustarLicencas && (
                  <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4">
                    <p className="max-w-prose text-xs text-gray-500">
                      Por padrão a quantidade de licenças segue a previsão de
                      alunos. Mude aqui só se esta solução cobrir menos — ou
                      mais — alunos do que o total matriculado no ano.
                    </p>
                    <fieldset
                      disabled={somenteLeitura}
                      className="flex flex-col gap-2.5"
                    >
                      {anosAtivos.map((ano) => {
                        const previsaoAno = ctx.previsao[ano] ?? 0;
                        const valor = licencas[ano] ?? previsaoAno;
                        const divergente =
                          licencas[ano] !== undefined &&
                          licencas[ano] !== previsaoAno;
                        return (
                          <div
                            key={ano}
                            className="flex flex-wrap items-center gap-2.5"
                          >
                            <span className="w-28 shrink-0 text-sm text-gray-600">
                              {anoEscolar(ano).nome}
                            </span>
                            <div className="w-24">
                              <Entrada
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={valor}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  const limpo = Number.isFinite(n)
                                    ? Math.max(0, Math.round(n))
                                    : 0;
                                  setLicencas((l) => ({ ...l, [ano]: limpo }));
                                }}
                                className="py-1.5"
                                aria-label={`Licenças de ${anoEscolar(ano).nome}`}
                              />
                            </div>
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
              </Cartao>
            )}

            {licencasDivergem && (
              <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
                Você está contratando licenças para{" "}
                <strong>{previa.alunos}</strong> aluno
                {previa.alunos === 1 ? "" : "s"} — a previsão para os anos
                marcados soma <strong>{alunosPrevistos}</strong>.
              </p>
            )}

            {!temObrigatorio && !somenteLeitura && (
              <label
                className={juntar(
                  "flex items-center gap-2.5 rounded-xl border border-dashed p-4 text-sm transition-colors",
                  recusado
                    ? "border-gray-400 bg-gray-100 text-gray-700"
                    : "border-gray-300 text-gray-600 hover:border-gray-400",
                )}
              >
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
          </>
        )}

        {erro && (
          <p
            role="alert"
            className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800"
          >
            {erro}
          </p>
        )}

        <Cartao className="flex-row flex-wrap items-center gap-5 p-4">
          <div className="flex flex-col">
            <span className="text-xs tracking-wide text-gray-500 uppercase">
              {rotuloQuantidade}s
            </span>
            <span className="font-mono text-sm font-medium tabular-nums">
              {previa.alunos}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs tracking-wide text-gray-500 uppercase">
              Esta solução / ano
            </span>
            <span className="font-mono text-sm font-medium tabular-nums">
              {formatarBRL(previa.valorAnual)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs tracking-wide text-gray-500 uppercase">
              Total até aqui
            </span>
            <span className="font-mono text-base font-semibold text-brand tabular-nums">
              {formatarBRL(totais.total)}
            </span>
          </div>

          <div className="flex-1" />

          <Botao
            variante="secundario"
            carregando={salvando}
            onClick={() => void gravar(indice > 0 ? indice - 1 : "voltar")}
          >
            Voltar
          </Botao>
          {somenteLeitura ? (
            <Botao onClick={aoAvancar}>Ver o mapa</Botao>
          ) : (
            <Botao
              carregando={salvando}
              disabled={precisaEscolherCredito}
              onClick={() =>
                void gravar(indice < linhas.length - 1 ? indice + 1 : "avancar")
              }
            >
              {indice < linhas.length - 1 ? "Próxima solução" : "Ver o mapa"}
            </Botao>
          )}
        </Cartao>
      </div>
    </div>
  );
}
