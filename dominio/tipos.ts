import type { AnoEscolarId, PrevisaoPorAno } from './anosEscolares';

/**
 * Dinheiro é sempre inteiro em CENTAVOS. Nunca float: 0.1 + 0.2 não fecha
 * caixa, e este app soma orçamento de 97 unidades.
 */
export type Centavos = number;

/** ISO 8601 em UTC. Datas viajam como string; Timestamp só dentro do Firestore. */
export type DataISO = string;

// ─── Pessoas e acesso ────────────────────────────────────────────

export type Papel = 'admin' | 'gestor_regional' | 'gestor_unidade' | 'leitura';

export type OrigemAuth = 'microsoft' | 'link';

export interface Usuario {
  id: string; // = uid do Firebase Auth
  nome: string;
  email: string;
  cargo?: string;
  papel: Papel;
  /** Obrigatório quando papel = gestor_unidade. */
  unidadeId?: string;
  /** Obrigatório quando papel = gestor_regional ou gestor_unidade. */
  regionalId?: string;
  origemAuth: OrigemAuth;
  criadoEm: DataISO;
  ultimoAcessoEm?: DataISO;
  ativo: boolean;
}

/**
 * Convite = link de acesso. O token em claro só existe no momento da criação,
 * dentro da resposta da function; no banco fica apenas o hash.
 */
export interface Convite {
  id: string;
  tokenHash: string;
  cicloId: string;
  unidadeId: string;
  regionalId: string;
  papel: Extract<Papel, 'gestor_unidade'>;
  email?: string;
  criadoPor: string;
  criadoEm: DataISO;
  expiraEm: DataISO;
  usos: number;
  usosMaximos: number;
  revogadoEm?: DataISO;
  revogadoPor?: string;
  ultimoUso?: { em: DataISO; ip: string; agente: string };
}

// ─── Estrutura da rede ───────────────────────────────────────────

export interface Regional {
  id: string;
  nome: string;
  ativa: boolean;
}

export interface Unidade {
  id: string;
  nome: string;
  codigo: string;
  regionalId: string;
  ativa: boolean;
}

export interface Fornecedor {
  id: string;
  nome: string;
  cnpj?: string;
  contatoNome?: string;
  contatoEmail?: string;
}

// ─── Ciclo ───────────────────────────────────────────────────────

export type EstadoCiclo = 'rascunho' | 'aberto' | 'encerrado';

export interface Ciclo {
  id: string;
  nome: string;
  /** Ano-alvo da contratação, ex.: 2027. */
  anoAlvo: number;
  estado: EstadoCiclo;
  aberturaEm: DataISO;
  /** Depois desta data o gestor não envia mais. Prorrogar = mudar a data. */
  prazoGestor: DataISO;
  prazoRegional: DataISO;
  criadoEm: DataISO;
}

// ─── Catálogo ────────────────────────────────────────────────────

export type BasePreco = 'aluno' | 'escola' | 'turma' | 'credito';
export type CicloCobranca = 'mensal' | 'anual';

export interface Precificacao {
  base: BasePreco;
  ciclo: CicloCobranca;
  /** Valor unitário em centavos. */
  valor: Centavos;
  /** Meses faturados no ano letivo. Só se aplica quando ciclo = mensal. */
  meses: number;
  /** Piso de cobrança: abaixo disso, cobra-se como se fosse este número. */
  minimoAlunos?: number;
}

export type Visibilidade = 'rascunho' | 'publicado' | 'suspenso';

export interface Produto {
  id: string;
  cicloId: string;
  nome: string;
  fornecedorId: string;
  categoria: string;
  descricao: string;
  materialUrl?: string;
  precificacao: Precificacao;
  /** Ordem na etapa de escolha. Obrigatórias primeiro, por convenção. */
  ordem: number;
  visibilidade: Visibilidade;
  criadoEm: DataISO;
  atualizadoEm: DataISO;
}

/**
 * Pacote fechado de soluções, pronto pra aplicar de uma vez — pensado pra
 * avaliação em geral, que costuma vir sempre com o mesmo combo (diagnóstica +
 * simulado + redação, por exemplo). Aplicar um modelo marca, pra cada
 * produto da lista, todos os anos habilitados na regional do gestor — os
 * mesmos anos que "todo o segmento" marcaria manualmente, em cada uma delas.
 * Nenhum vínculo permanece depois: é só um atalho de preenchimento, o
 * gestor segue livre pra revisar e mudar qualquer solução uma a uma.
 */
export interface Modelo {
  id: string;
  cicloId: string;
  nome: string;
  descricao: string;
  categoria: string;
  /** Na ordem em que aparecem na etapa de escolha. */
  produtoIds: string[];
  visibilidade: Visibilidade;
  criadoEm: DataISO;
  atualizadoEm: DataISO;
}

export type Obrigatoriedade = 'indisponivel' | 'opcional' | 'obrigatorio';

/**
 * A unidade de configuração é a regra, não o produto: a mesma solução pode ser
 * obrigatória no Fundamental de Recife e indisponível no Médio de Curitiba.
 * Ausência de documento equivale a 'indisponivel'.
 */
export interface RegraHabilitacao {
  id: string; // `${regionalId}_${anoEscolar}`
  produtoId: string;
  regionalId: string;
  anoEscolar: AnoEscolarId;
  obrigatoriedade: Exclude<Obrigatoriedade, 'indisponivel'>;
  /** Preço negociado nesta regional; sobrepõe o do produto quando existir. */
  precoOverride?: Precificacao;
}

// ─── Previsão de alunos ──────────────────────────────────────────

export interface Matricula {
  id: string; // `${cicloId}_${unidadeId}`
  cicloId: string;
  unidadeId: string;
  regionalId: string;
  porAno: PrevisaoPorAno;
  origem: 'admin' | 'gestor';
  confirmadaEm?: DataISO;
  atualizadoPor: string;
  atualizadoEm: DataISO;
}

// ─── Pedido ──────────────────────────────────────────────────────

export type EstadoPedido =
  | 'rascunho'
  | 'enviado'
  | 'em_analise'
  | 'aprovado'
  | 'aprovado_parcial'
  | 'devolvido'
  | 'reprovado';

/** Estados em que o gestor ainda pode editar. */
export const ESTADOS_EDITAVEIS: readonly EstadoPedido[] = ['rascunho', 'devolvido'];

/** Estados finais: não há transição de saída. */
export const ESTADOS_FINAIS: readonly EstadoPedido[] = [
  'aprovado',
  'aprovado_parcial',
  'reprovado',
];

export interface TotaisPedido {
  obrigatorio: Centavos;
  opcional: Centavos;
  total: Centavos;
  /** Preenchido na decisão da regional. */
  aprovado?: Centavos;
}

export interface Pedido {
  id: string; // `${cicloId}_${unidadeId}` — uma unidade, um pedido por ciclo
  cicloId: string;
  unidadeId: string;
  regionalId: string;
  solicitante: { uid: string; nome: string; email: string; cargo?: string };
  estado: EstadoPedido;
  /** Sobe a cada devolução. Serve para não confundir versões na trilha. */
  versao: number;
  totais: TotaisPedido;
  criadoEm: DataISO;
  atualizadoEm: DataISO;
  enviadoEm?: DataISO;
  decididoEm?: DataISO;
  decididoPor?: string;
  comentarioDecisao?: string;
}

/** Como o item entrou no pedido. */
export type OrigemItem = 'obrigatorio' | 'escolha' | 'recusado';

export type DecisaoItem = 'pendente' | 'aprovado' | 'recusado';

export interface ItemPedido {
  id: string; // = produtoId
  produtoId: string;
  produtoNome: string;
  fornecedorNome: string;
  categoria: string;
  anosSelecionados: AnoEscolarId[];
  /** Cópia da previsão usada no cálculo — congelada no envio. */
  alunosPorAno: PrevisaoPorAno;
  alunosTotal: number;
  /**
   * Só quando a solução é cobrada por crédito: a quantidade de créditos
   * digitada em cada ano escolar — o gestor digita direto, não é um
   * multiplicador sobre a previsão. O mesmo serviço gasta números
   * diferentes por ano (redação corrigida: poucas no fundamental, muitas
   * no 3º do médio), então não é um número só para a solução inteira.
   */
  creditosPorAno?: PrevisaoPorAno;
  /** Cópia do preço vigente no envio. Corrigir o catálogo depois não mexe aqui. */
  precoSnapshot: Precificacao;
  valorAnual: Centavos;
  origem: OrigemItem;
  decisao: DecisaoItem;
  justificativa?: string;
  atualizadoEm: DataISO;
}

export type TipoEvento =
  | 'criado'
  | 'enviado'
  | 'devolvido'
  | 'reaberto'
  | 'aprovado'
  | 'aprovado_parcial'
  | 'reprovado'
  | 'previsao_confirmada';

export interface EventoPedido {
  id: string;
  tipo: TipoEvento;
  autor: { uid: string; nome: string; papel: Papel };
  em: DataISO;
  comentario?: string;
  versao: number;
  snapshotTotais?: TotaisPedido;
}
