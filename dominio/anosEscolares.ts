/**
 * Catálogo dos anos escolares do padrão brasileiro, da Educação Infantil ao
 * Ensino Médio. São 17 — é essa a lista que vira coluna no mapa da etapa 4.
 *
 * O código é estável e vira chave de mapa em vários lugares (previsão de
 * alunos, regras de habilitação, itens do pedido). Nunca renomear um código
 * existente: acrescente um novo e migre.
 */

export type SegmentoId = 'infantil' | 'anos_iniciais' | 'anos_finais' | 'medio';

export type AnoEscolarId =
  | 'EI1'
  | 'EI2'
  | 'EI3'
  | 'EI4'
  | 'EI5'
  | 'EF1'
  | 'EF2'
  | 'EF3'
  | 'EF4'
  | 'EF5'
  | 'EF6'
  | 'EF7'
  | 'EF8'
  | 'EF9'
  | 'EM1'
  | 'EM2'
  | 'EM3';

export interface AnoEscolar {
  id: AnoEscolarId;
  /** Rótulo completo, usado em listas e no PDF. */
  nome: string;
  /** Rótulo curto, usado no cabeçalho das colunas do mapa. */
  curto: string;
  segmento: SegmentoId;
  ordem: number;
}

export interface Segmento {
  id: SegmentoId;
  nome: string;
  ordem: number;
}

export const SEGMENTOS: readonly Segmento[] = [
  { id: 'infantil', nome: 'Educação Infantil', ordem: 1 },
  { id: 'anos_iniciais', nome: 'Fundamental — anos iniciais', ordem: 2 },
  { id: 'anos_finais', nome: 'Fundamental — anos finais', ordem: 3 },
  { id: 'medio', nome: 'Ensino Médio', ordem: 4 },
] as const;

export const ANOS_ESCOLARES: readonly AnoEscolar[] = [
  { id: 'EI1', nome: 'Berçário', curto: 'Berç.', segmento: 'infantil', ordem: 1 },
  { id: 'EI2', nome: 'Maternal I', curto: 'M I', segmento: 'infantil', ordem: 2 },
  { id: 'EI3', nome: 'Maternal II', curto: 'M II', segmento: 'infantil', ordem: 3 },
  { id: 'EI4', nome: 'Pré I', curto: 'Pré I', segmento: 'infantil', ordem: 4 },
  { id: 'EI5', nome: 'Pré II', curto: 'Pré II', segmento: 'infantil', ordem: 5 },
  { id: 'EF1', nome: '1º ano', curto: '1º', segmento: 'anos_iniciais', ordem: 6 },
  { id: 'EF2', nome: '2º ano', curto: '2º', segmento: 'anos_iniciais', ordem: 7 },
  { id: 'EF3', nome: '3º ano', curto: '3º', segmento: 'anos_iniciais', ordem: 8 },
  { id: 'EF4', nome: '4º ano', curto: '4º', segmento: 'anos_iniciais', ordem: 9 },
  { id: 'EF5', nome: '5º ano', curto: '5º', segmento: 'anos_iniciais', ordem: 10 },
  { id: 'EF6', nome: '6º ano', curto: '6º', segmento: 'anos_finais', ordem: 11 },
  { id: 'EF7', nome: '7º ano', curto: '7º', segmento: 'anos_finais', ordem: 12 },
  { id: 'EF8', nome: '8º ano', curto: '8º', segmento: 'anos_finais', ordem: 13 },
  { id: 'EF9', nome: '9º ano', curto: '9º', segmento: 'anos_finais', ordem: 14 },
  { id: 'EM1', nome: '1ª série', curto: '1ª', segmento: 'medio', ordem: 15 },
  { id: 'EM2', nome: '2ª série', curto: '2ª', segmento: 'medio', ordem: 16 },
  { id: 'EM3', nome: '3ª série', curto: '3ª', segmento: 'medio', ordem: 17 },
] as const;

const POR_ID = new Map<string, AnoEscolar>(ANOS_ESCOLARES.map((a) => [a.id, a]));

export function anoEscolar(id: AnoEscolarId): AnoEscolar {
  const encontrado = POR_ID.get(id);
  if (!encontrado) throw new Error(`Ano escolar desconhecido: ${id}`);
  return encontrado;
}

export function ehAnoEscolarValido(id: string): id is AnoEscolarId {
  return POR_ID.has(id);
}

export function anosDoSegmento(segmento: SegmentoId): readonly AnoEscolar[] {
  return ANOS_ESCOLARES.filter((a) => a.segmento === segmento);
}

/** Ordena uma lista de códigos na ordem pedagógica, não alfabética. */
export function ordenarAnos(ids: readonly AnoEscolarId[]): AnoEscolarId[] {
  return [...ids].sort((a, b) => anoEscolar(a).ordem - anoEscolar(b).ordem);
}

/** Previsão de alunos por ano escolar. Ano ausente ou zero = série não ofertada. */
export type PrevisaoPorAno = Partial<Record<AnoEscolarId, number>>;

export function totalDeAlunos(previsao: PrevisaoPorAno): number {
  return Object.values(previsao).reduce<number>((soma, n) => soma + (n ?? 0), 0);
}

export function alunosNosAnos(previsao: PrevisaoPorAno, anos: readonly AnoEscolarId[]): number {
  return anos.reduce<number>((soma, ano) => soma + (previsao[ano] ?? 0), 0);
}

/** Anos com previsão maior que zero — os únicos que aparecem na escolha. */
export function anosOfertados(previsao: PrevisaoPorAno): AnoEscolarId[] {
  return ANOS_ESCOLARES.filter((a) => (previsao[a.id] ?? 0) > 0).map((a) => a.id);
}
