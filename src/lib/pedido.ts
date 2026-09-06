import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { AnoEscolarId, PrevisaoPorAno } from '@dominio/anosEscolares';
import { aplicarLicencas } from '@dominio/anosEscolares';
import { calcularItem } from '@dominio/preco';
import { anosEfetivos, resolverHabilitacao } from '@dominio/habilitacao';
import type { HabilitacaoResolvida } from '@dominio/habilitacao';
import type {
  Centavos,
  Ciclo,
  Fornecedor,
  ItemPedido,
  Matricula,
  Pedido,
  Produto,
  RegraHabilitacao,
  Unidade,
} from '@dominio/tipos';
import { db, functions } from './firebase';
import type { Sessao } from './auth';

/**
 * Dados do fluxo do gestor.
 *
 * Os valores calculados aqui existem para dar resposta imediata na tela. O
 * número que vale é o que a Cloud Function grava no envio, recalculado sobre
 * o catálogo e a previsão do servidor — se os dois discordarem, o servidor
 * está certo e a tela estava desatualizada.
 */

export interface ContextoPedido {
  ciclo: Ciclo;
  unidade: Unidade;
  previsao: PrevisaoPorAno;
  previsaoConfirmada: boolean;
  produtos: Produto[];
  regras: RegraHabilitacao[];
  fornecedores: Map<string, string>;
  pedido: Pedido | null;
  itens: Map<string, ItemPedido>;
}

export function idPedido(cicloId: string, unidadeId: string): string {
  return `${cicloId}_${unidadeId}`;
}

export function idMatricula(cicloId: string, unidadeId: string): string {
  return `${cicloId}_${unidadeId}`;
}

/** O ciclo corrente: o mais recente que estiver aberto, senão o mais recente. */
export async function cicloCorrente(): Promise<Ciclo | null> {
  const snap = await getDocs(query(collection(db, 'ciclos'), orderBy('anoAlvo', 'desc')));
  const ciclos = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ciclo);
  return ciclos.find((c) => c.estado === 'aberto') ?? ciclos[0] ?? null;
}

export async function carregarContexto(sessao: Sessao): Promise<ContextoPedido | null> {
  if (!sessao.unidadeId || !sessao.regionalId) return null;

  const ciclo = await cicloCorrente();
  if (!ciclo) return null;

  const [unidadeDoc, matriculaDoc, produtosSnap, regrasSnap, fornecedoresSnap, pedidoDoc] =
    await Promise.all([
      getDoc(doc(db, 'unidades', sessao.unidadeId)),
      getDoc(doc(db, 'matriculas', idMatricula(ciclo.id, sessao.unidadeId))),
      getDocs(
        query(
          collection(db, 'produtos'),
          where('cicloId', '==', ciclo.id),
          where('visibilidade', '==', 'publicado'),
          orderBy('ordem'),
        ),
      ),
      getDocs(query(collectionGroup(db, 'regras'), where('regionalId', '==', sessao.regionalId))),
      getDocs(collection(db, 'fornecedores')),
      getDoc(doc(db, 'pedidos', idPedido(ciclo.id, sessao.unidadeId))),
    ]);

  if (!unidadeDoc.exists()) return null;

  const matricula = matriculaDoc.exists() ? (matriculaDoc.data() as Matricula) : null;
  const pedido = pedidoDoc.exists()
    ? ({ id: pedidoDoc.id, ...pedidoDoc.data() } as Pedido)
    : null;

  const itens = new Map<string, ItemPedido>();
  if (pedido) {
    const itensSnap = await getDocs(collection(db, 'pedidos', pedido.id, 'itens'));
    for (const d of itensSnap.docs) itens.set(d.id, { id: d.id, ...d.data() } as ItemPedido);
  }

  return {
    ciclo,
    unidade: { id: unidadeDoc.id, ...unidadeDoc.data() } as Unidade,
    previsao: matricula?.porAno ?? {},
    previsaoConfirmada: !!matricula?.confirmadaEm,
    produtos: produtosSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Produto),
    regras: regrasSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegraHabilitacao),
    fornecedores: new Map(
      fornecedoresSnap.docs.map((d) => [d.id, (d.data() as Fornecedor).nome]),
    ),
    pedido,
    itens,
  };
}

// ─── Etapa 2: previsão de alunos ─────────────────────────────────

/** Ano com zero sai do mapa: série que a unidade não vai ofertar não deve
 * aparecer na escolha nem entrar em conta nenhuma. */
export function limparPrevisao(porAno: PrevisaoPorAno): PrevisaoPorAno {
  const limpo: PrevisaoPorAno = {};
  for (const [ano, n] of Object.entries(porAno)) {
    if (typeof n === 'number' && n > 0) limpo[ano as AnoEscolarId] = Math.round(n);
  }
  return limpo;
}

export async function salvarPrevisao(
  ciclo: Ciclo,
  sessao: Sessao,
  porAno: PrevisaoPorAno,
  confirmar: boolean,
): Promise<void> {
  const limpo = limparPrevisao(porAno);

  await setDoc(
    doc(db, 'matriculas', idMatricula(ciclo.id, sessao.unidadeId!)),
    {
      cicloId: ciclo.id,
      unidadeId: sessao.unidadeId,
      regionalId: sessao.regionalId,
      porAno: limpo,
      origem: 'gestor',
      atualizadoPor: sessao.uid,
      atualizadoEm: new Date().toISOString(),
      ...(confirmar ? { confirmadaEm: new Date().toISOString() } : {}),
    },
    { merge: true },
  );
}

// ─── Etapa 3: escolha ────────────────────────────────────────────

/** Abre o rascunho, se ainda não existir. Idempotente. */
export async function abrirRascunho(ciclo: Ciclo, sessao: Sessao): Promise<string> {
  const id = idPedido(ciclo.id, sessao.unidadeId!);
  const existente = await getDoc(doc(db, 'pedidos', id));
  if (existente.exists()) return id;

  await setDoc(doc(db, 'pedidos', id), {
    cicloId: ciclo.id,
    unidadeId: sessao.unidadeId,
    regionalId: sessao.regionalId,
    solicitante: { uid: sessao.uid, nome: sessao.nome, email: sessao.email },
    estado: 'rascunho',
    versao: 1,
    totais: { obrigatorio: 0, opcional: 0, total: 0 },
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  });
  return id;
}

export interface DecisaoLocal {
  anos: AnoEscolarId[];
  recusado: boolean;
  /**
   * Só quando a solução é cobrada por crédito: o múltiplo escolhido em cada
   * ano — o mesmo serviço pode gastar mais créditos por aluno num ano do
   * que em outro, então não é um número só para a solução inteira.
   */
  creditosPorAno?: PrevisaoPorAno;
  /**
   * Quantidade de licenças ajustada manualmente, um ano de cada vez — só
   * entra quando o gestor mexeu; ano ausente aqui segue a previsão normal.
   */
  licencasPorAno?: PrevisaoPorAno;
}

/** A conta pura por trás de uma decisão — sem gravar nada. Usada tanto pelo
 * salvamento real quanto pelo escritor simulado, para os dois nunca divergirem. */
export function computarItem(
  produto: Produto,
  habilitacao: HabilitacaoResolvida,
  fornecedorNome: string,
  previsao: PrevisaoPorAno,
  decisao: DecisaoLocal,
): ItemPedido {
  const anos = decisao.recusado ? habilitacao.obrigatorios : anosEfetivos(habilitacao, decisao.anos);
  const previsaoEfetiva = aplicarLicencas(previsao, decisao.licencasPorAno, anos);
  const { alunos, valorAnual } = calcularItem(
    habilitacao.preco,
    previsaoEfetiva,
    anos,
    decisao.creditosPorAno,
  );

  const alunosPorAno: PrevisaoPorAno = {};
  for (const ano of anos) alunosPorAno[ano] = previsaoEfetiva[ano] ?? 0;

  return {
    id: produto.id,
    produtoId: produto.id,
    produtoNome: produto.nome,
    fornecedorNome,
    categoria: produto.categoria,
    anosSelecionados: anos,
    alunosPorAno,
    alunosTotal: alunos,
    precoSnapshot: habilitacao.preco,
    valorAnual,
    origem:
      anos.length === 0 ? 'recusado' : habilitacao.obrigatorios.length > 0 ? 'obrigatorio' : 'escolha',
    decisao: 'pendente',
    atualizadoEm: new Date().toISOString(),
    ...(habilitacao.preco.base === 'credito' && decisao.creditosPorAno
      ? { creditosPorAno: decisao.creditosPorAno }
      : {}),
  };
}

/**
 * Grava a decisão do gestor sobre uma solução. O valor gravado aqui é
 * provisório e será recalculado no envio — mas gravamos mesmo assim, para
 * que a revisão e o mapa mostrem números sem refazer a conta a cada tela.
 */
export async function salvarDecisao(
  pedidoId: string,
  produto: Produto,
  habilitacao: HabilitacaoResolvida,
  fornecedorNome: string,
  previsao: PrevisaoPorAno,
  decisao: DecisaoLocal,
): Promise<ItemPedido> {
  const item = computarItem(produto, habilitacao, fornecedorNome, previsao, decisao);
  const { id: _id, ...semId } = item;
  await setDoc(doc(db, 'pedidos', pedidoId, 'itens', produto.id), semId);
  return item;
}

export async function apagarDecisao(pedidoId: string, produtoId: string): Promise<void> {
  await deleteDoc(doc(db, 'pedidos', pedidoId, 'itens', produtoId));
}

// ─── Cálculo de tela ─────────────────────────────────────────────

export interface LinhaCalculada {
  produto: Produto;
  habilitacao: HabilitacaoResolvida;
  item: ItemPedido | undefined;
  decidida: boolean;
  valorAnual: Centavos;
}

/** Resolve habilitação e valor de todas as soluções de uma vez. */
export function calcularLinhas(ctx: ContextoPedido, regionalId: string): LinhaCalculada[] {
  return ctx.produtos
    .map((produto) => {
      const habilitacao = resolverHabilitacao(produto, ctx.regras, regionalId, ctx.previsao);
      const item = ctx.itens.get(produto.id);
      const obrigatoria = habilitacao.obrigatorios.length > 0;
      return {
        produto,
        habilitacao,
        item,
        // Obrigatória já nasce decidida: não há o que escolher.
        decidida: obrigatoria || !!item,
        valorAnual: item?.valorAnual ?? 0,
      };
    })
    .filter((l) => l.habilitacao.disponivel);
}

export interface Totais {
  obrigatorio: Centavos;
  opcional: Centavos;
  total: Centavos;
}

export function somarTotais(linhas: readonly LinhaCalculada[]): Totais {
  let obrigatorio = 0;
  let opcional = 0;
  for (const l of linhas) {
    if (l.habilitacao.obrigatorios.length > 0) obrigatorio += l.valorAnual;
    else opcional += l.valorAnual;
  }
  return { obrigatorio, opcional, total: obrigatorio + opcional };
}

// ─── Etapa 5: envio ──────────────────────────────────────────────

export async function enviarPedido(cicloId: string): Promise<{ totais: Totais }> {
  const enviar = httpsCallable<{ cicloId: string }, { totais: Totais }>(functions, 'enviarPedido');
  const { data } = await enviar({ cicloId });
  return data;
}

// ─── Escritor ────────────────────────────────────────────────────

/**
 * As quatro escritas que as telas do gestor fazem, atrás de uma interface —
 * é o que permite ao admin simular o preenchimento (`pedidoSimulado.ts`)
 * reaproveitando as mesmas telas sem gravar nada em nome de uma unidade que
 * não é dele.
 */
export interface EscritorPedido {
  salvarPrevisao: typeof salvarPrevisao;
  abrirRascunho: typeof abrirRascunho;
  salvarDecisao: typeof salvarDecisao;
  enviarPedido: typeof enviarPedido;
}

export const escritorPedidoReal: EscritorPedido = {
  salvarPrevisao,
  abrirRascunho,
  salvarDecisao,
  enviarPedido,
};
