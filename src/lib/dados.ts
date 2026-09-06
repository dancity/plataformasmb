import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type {
  Ciclo,
  EstadoCiclo,
  Fornecedor,
  ItemModelo,
  Modelo,
  Obrigatoriedade,
  Produto,
  Regional,
  RegraHabilitacao,
  TipoUnidade,
  Unidade,
} from '@dominio/tipos';
import { ANOS_ESCOLARES } from '@dominio/anosEscolares';
import { db } from './firebase';

/**
 * Leitura e escrita do catálogo. Só o admin escreve aqui, e as regras do
 * Firestore garantem isso — estas funções são conveniência, não controle.
 *
 * Pedido não aparece neste arquivo de propósito: pedido só muda por Cloud
 * Function.
 */

// ─── Regionais ───────────────────────────────────────────────────

/** As seis regionais da rede. Lista fixa: não é cadastro do dia a dia. */
export const REGIONAIS_PADRAO: readonly { id: string; nome: string }[] = [
  { id: 'recife', nome: 'Recife' },
  { id: 'brasilia', nome: 'Brasília' },
  { id: 'belo-horizonte', nome: 'Belo Horizonte' },
  { id: 'porto-alegre', nome: 'Porto Alegre' },
  { id: 'curitiba', nome: 'Curitiba' },
  { id: 'sao-paulo', nome: 'São Paulo' },
];

export async function listarRegionais(): Promise<Regional[]> {
  const snap = await getDocs(query(collection(db, 'regionais'), orderBy('nome')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Regional);
}

/** Idempotente: rodar de novo não duplica nem sobrescreve o que já existe. */
export async function semearRegionais(): Promise<number> {
  const existentes = new Set((await listarRegionais()).map((r) => r.id));
  const faltando = REGIONAIS_PADRAO.filter((r) => !existentes.has(r.id));
  if (faltando.length === 0) return 0;

  const lote = writeBatch(db);
  for (const r of faltando) {
    lote.set(doc(db, 'regionais', r.id), { nome: r.nome, ativa: true });
  }
  await lote.commit();
  return faltando.length;
}

// ─── Unidades ────────────────────────────────────────────────────

export async function listarUnidades(regionalId?: string): Promise<Unidade[]> {
  const base = collection(db, 'unidades');
  const consulta = regionalId
    ? query(base, where('regionalId', '==', regionalId), orderBy('nome'))
    : query(base, orderBy('nome'));
  const snap = await getDocs(consulta);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Unidade);
}

export async function criarUnidade(dados: {
  nome: string;
  codigo: string;
  regionalId: string;
  tipo: TipoUnidade;
}): Promise<string> {
  const id = dados.codigo.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await setDoc(doc(db, 'unidades', id), {
    nome: dados.nome.trim(),
    codigo: dados.codigo.trim(),
    regionalId: dados.regionalId,
    tipo: dados.tipo,
    ativa: true,
  });
  return id;
}

export async function atualizarUnidade(
  id: string,
  dados: Partial<{ nome: string; regionalId: string; tipo: TipoUnidade; ativa: boolean }>,
): Promise<void> {
  await updateDoc(doc(db, 'unidades', id), { ...dados });
}

// ─── Ciclos ──────────────────────────────────────────────────────

export async function listarCiclos(): Promise<Ciclo[]> {
  const snap = await getDocs(query(collection(db, 'ciclos'), orderBy('anoAlvo', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ciclo);
}

function emDias(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString();
}

/**
 * O ciclo nasce em rascunho. Abrir é ato separado e deliberado: é o que
 * libera 97 unidades a enviar pedido, e não deve acontecer por engano
 * enquanto o catálogo ainda está sendo montado.
 */
export async function criarCiclo(anoAlvo: number): Promise<string> {
  const id = `c${anoAlvo}`;
  const ciclo: Omit<Ciclo, 'id'> = {
    nome: `Contratação ${anoAlvo}`,
    anoAlvo,
    estado: 'rascunho',
    aberturaEm: new Date().toISOString(),
    prazoGestor: emDias(45),
    prazoRegional: emDias(75),
    criadoEm: new Date().toISOString(),
  };
  await setDoc(doc(db, 'ciclos', id), ciclo);
  return id;
}

export async function mudarEstadoCiclo(cicloId: string, estado: EstadoCiclo): Promise<void> {
  await updateDoc(doc(db, 'ciclos', cicloId), { estado });
}

export async function mudarPrazos(
  cicloId: string,
  prazos: { prazoGestor?: string; prazoRegional?: string },
): Promise<void> {
  await updateDoc(doc(db, 'ciclos', cicloId), prazos);
}

// ─── Contagens para o painel ─────────────────────────────────────

async function contar(caminho: string, filtro?: [string, string]): Promise<number> {
  const base = collection(db, caminho);
  const consulta = filtro ? query(base, where(filtro[0], '==', filtro[1])) : query(base);
  const snap = await getCountFromServer(consulta);
  return snap.data().count;
}

export interface ResumoCiclo {
  regionais: number;
  unidades: number;
  solucoes: number;
  pedidosEnviados: number;
}

/** Contagem no servidor: não traz 97 documentos para contar 97. */
export async function resumoDoCiclo(cicloId: string): Promise<ResumoCiclo> {
  const [regionais, unidades, solucoes, pedidosEnviados] = await Promise.all([
    contar('regionais'),
    contar('unidades'),
    contar('produtos', ['cicloId', cicloId]),
    contar('pedidos', ['cicloId', cicloId]),
  ]);
  return { regionais, unidades, solucoes, pedidosEnviados };
}

// ─── Fornecedores ────────────────────────────────────────────────

export async function listarFornecedores(): Promise<Fornecedor[]> {
  const snap = await getDocs(query(collection(db, 'fornecedores'), orderBy('nome')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Fornecedor);
}

export async function criarFornecedor(dados: {
  nome: string;
  cnpj?: string;
  contatoEmail?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'fornecedores'), {
    nome: dados.nome.trim(),
    ...(dados.cnpj?.trim() ? { cnpj: dados.cnpj.trim() } : {}),
    ...(dados.contatoEmail?.trim() ? { contatoEmail: dados.contatoEmail.trim() } : {}),
  });
  return ref.id;
}

export async function excluirFornecedor(id: string): Promise<void> {
  await deleteDoc(doc(db, 'fornecedores', id));
}

// ─── Produtos ────────────────────────────────────────────────────

export async function listarProdutos(cicloId: string): Promise<Produto[]> {
  const snap = await getDocs(
    query(collection(db, 'produtos'), where('cicloId', '==', cicloId), orderBy('ordem')),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Produto);
}

export async function obterProduto(id: string): Promise<Produto | null> {
  const snap = await getDoc(doc(db, 'produtos', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Produto) : null;
}

export type DadosProduto = Omit<Produto, 'id' | 'criadoEm' | 'atualizadoEm'>;

export async function criarProduto(dados: DadosProduto): Promise<string> {
  const agora = new Date().toISOString();
  const ref = await addDoc(collection(db, 'produtos'), {
    ...dados,
    criadoEm: agora,
    atualizadoEm: agora,
  });
  return ref.id;
}

export async function atualizarProduto(id: string, dados: Partial<DadosProduto>): Promise<void> {
  await updateDoc(doc(db, 'produtos', id), { ...dados, atualizadoEm: new Date().toISOString() });
}

/**
 * Duplica um produto inteiro — dados e grade de habilitação — para servir de
 * ponto de partida numa solução parecida. Sai como rascunho mesmo que o
 * original esteja publicado: cópia não deve aparecer para o gestor até
 * alguém revisar nome, preço e fornecedor.
 */
export async function duplicarProduto(id: string): Promise<string> {
  const original = await obterProduto(id);
  if (!original) throw new Error('Solução não encontrada.');
  const regras = await getDocs(collection(db, 'produtos', id, 'regras'));

  const agora = new Date().toISOString();
  const { id: _id, criadoEm: _criadoEm, atualizadoEm: _atualizadoEm, ...dados } = original;
  const ref = await addDoc(collection(db, 'produtos'), {
    ...dados,
    nome: `${original.nome} (cópia)`,
    visibilidade: 'rascunho',
    criadoEm: agora,
    atualizadoEm: agora,
  });

  if (!regras.empty) {
    const lote = writeBatch(db);
    for (const r of regras.docs) {
      lote.set(doc(db, 'produtos', ref.id, 'regras', r.id), { ...r.data(), produtoId: ref.id });
    }
    await lote.commit();
  }

  return ref.id;
}

export async function excluirProduto(id: string): Promise<void> {
  // As regras vão junto: subcoleção órfã continuaria habilitando um produto
  // que não existe mais.
  const regras = await getDocs(collection(db, 'produtos', id, 'regras'));
  const lote = writeBatch(db);
  regras.docs.forEach((r) => lote.delete(r.ref));
  lote.delete(doc(db, 'produtos', id));
  await lote.commit();
}

/**
 * Apaga todo o catálogo de um ciclo — produto e regras de todos, de uma vez.
 * Existe para limpar dado de teste durante a montagem do catálogo; um
 * ciclo com pedido já em andamento não deveria passar por aqui.
 *
 * Cada exclusão vira duas operações (produto + suas regras), e o lote do
 * Firestore tem teto de 500 — por isso os deletes saem em blocos.
 */
export async function excluirTodosProdutos(cicloId: string): Promise<number> {
  const produtos = await listarProdutos(cicloId);
  if (produtos.length === 0) return 0;

  const refsRegras = await Promise.all(
    produtos.map((p) => getDocs(collection(db, 'produtos', p.id, 'regras'))),
  );
  const paraApagar = [
    ...produtos.map((p) => doc(db, 'produtos', p.id)),
    ...refsRegras.flatMap((snap) => snap.docs.map((r) => r.ref)),
  ];

  const TAMANHO_BLOCO = 450;
  for (let i = 0; i < paraApagar.length; i += TAMANHO_BLOCO) {
    const lote = writeBatch(db);
    for (const ref of paraApagar.slice(i, i + TAMANHO_BLOCO)) lote.delete(ref);
    await lote.commit();
  }

  return produtos.length;
}

// ─── Modelos ─────────────────────────────────────────────────────

/**
 * Lê um documento de modelo tolerando o formato anterior à mudança que deu a
 * cada avaliação seus próprios anos escolares (`produtoIds: string[]` virou
 * `itens: ItemModelo[]`). Só na leitura — nunca grava de volta no formato
 * velho. Um modelo migrado assim nasce marcado em todos os anos em cada
 * avaliação; abrir pra editar e ajustar é o caminho normal a partir daí.
 */
function paraModelo(id: string, data: Record<string, unknown>): Modelo {
  const bruto = data as Omit<Modelo, 'id' | 'itens'> & {
    itens?: ItemModelo[];
    produtoIds?: string[];
  };
  const itens: ItemModelo[] =
    bruto.itens ??
    (bruto.produtoIds ?? []).map((produtoId) => ({
      produtoId,
      anos: ANOS_ESCOLARES.map((a) => a.id),
    }));
  return { ...bruto, id, itens };
}

/** Todos os modelos do ciclo, qualquer visibilidade — uso do admin. */
export async function listarModelos(cicloId: string): Promise<Modelo[]> {
  const snap = await getDocs(
    query(collection(db, 'modelos'), where('cicloId', '==', cicloId), orderBy('nome')),
  );
  return snap.docs.map((d) => paraModelo(d.id, d.data()));
}

/** Só os publicados — o que a etapa de escolha do gestor oferece. */
export async function listarModelosPublicados(cicloId: string): Promise<Modelo[]> {
  const snap = await getDocs(
    query(
      collection(db, 'modelos'),
      where('cicloId', '==', cicloId),
      where('visibilidade', '==', 'publicado'),
      orderBy('nome'),
    ),
  );
  return snap.docs.map((d) => paraModelo(d.id, d.data()));
}

export async function obterModelo(id: string): Promise<Modelo | null> {
  const snap = await getDoc(doc(db, 'modelos', id));
  return snap.exists() ? paraModelo(snap.id, snap.data()) : null;
}

export type DadosModelo = Omit<Modelo, 'id' | 'criadoEm' | 'atualizadoEm'>;

export async function criarModelo(dados: DadosModelo): Promise<string> {
  const agora = new Date().toISOString();
  const ref = await addDoc(collection(db, 'modelos'), {
    ...dados,
    criadoEm: agora,
    atualizadoEm: agora,
  });
  return ref.id;
}

export async function atualizarModelo(id: string, dados: Partial<DadosModelo>): Promise<void> {
  await updateDoc(doc(db, 'modelos', id), { ...dados, atualizadoEm: new Date().toISOString() });
}

export async function excluirModelo(id: string): Promise<void> {
  await deleteDoc(doc(db, 'modelos', id));
}

// ─── Regras de habilitação ───────────────────────────────────────

/**
 * A unidade de configuração do catálogo. Ausência de documento significa
 * "indisponível" — por isso desmarcar apaga em vez de gravar um estado.
 */
export async function listarRegras(produtoId: string): Promise<RegraHabilitacao[]> {
  const snap = await getDocs(collection(db, 'produtos', produtoId, 'regras'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegraHabilitacao);
}

export type GradeHabilitacao = Record<string, Record<string, Obrigatoriedade>>;

/** Converte a subcoleção na grade regional × ano que a tela manipula. */
export function regrasParaGrade(regras: readonly RegraHabilitacao[]): GradeHabilitacao {
  const grade: GradeHabilitacao = {};
  for (const r of regras) {
    (grade[r.regionalId] ??= {})[r.anoEscolar] = r.obrigatoriedade;
  }
  return grade;
}

export async function salvarGrade(
  produtoId: string,
  grade: GradeHabilitacao,
  anteriores: readonly RegraHabilitacao[],
): Promise<void> {
  const lote = writeBatch(db);
  const base = collection(db, 'produtos', produtoId, 'regras');
  const vistos = new Set<string>();

  for (const [regionalId, anos] of Object.entries(grade)) {
    for (const [anoEscolar, estado] of Object.entries(anos)) {
      if (estado === 'indisponivel') continue;
      const id = `${regionalId}_${anoEscolar}`;
      vistos.add(id);
      lote.set(doc(base, id), { produtoId, regionalId, anoEscolar, obrigatoriedade: estado });
    }
  }

  for (const antiga of anteriores) {
    if (!vistos.has(antiga.id)) lote.delete(doc(base, antiga.id));
  }

  await lote.commit();
}

// Marcador para futuras escritas que precisem de horário do servidor.
export { serverTimestamp };
