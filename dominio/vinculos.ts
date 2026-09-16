import type { AnoEscolarId } from './anosEscolares';
import { ordenarAnos } from './anosEscolares';
import type { Conjunto, Produto } from './tipos';

/**
 * Vínculos entre soluções — o que uma decisão faz com as outras.
 *
 * Fica fora de `habilitacao.ts` de propósito: aquilo resolve o catálogo
 * (produto × ano × previsão) e não depende do que a unidade escolheu; isto
 * depende, e por isso só pode ser avaliado com o pedido em mãos. Roda nos
 * dois lados — o app usa para travar a tela, e o `enviarPedido` usa para
 * derrubar o que não podia ter entrado. Esconder na interface não é proteger.
 */

/** O que a unidade já levou, no momento em que a conta é feita. */
export interface EstadoContratacao {
  /** Ids dos modelos adotados (vêm de `item.origemModeloId`). */
  modelosAdotados: ReadonlySet<string>;
  /** Ids dos produtos com pelo menos um ano contratado. */
  produtosContratados: ReadonlySet<string>;
}

/** Por que uma solução está travada, e o que destravaria. */
export interface Bloqueio {
  motivo: 'prerequisito';
  /** Adotar qualquer um destes modelos libera. */
  modelos: string[];
  /** Contratar qualquer uma destas soluções libera. */
  produtos: string[];
}

export function estadoVazio(): EstadoContratacao {
  return { modelosAdotados: new Set(), produtosContratados: new Set() };
}

/**
 * O bloqueio da solução, ou `undefined` quando ela está liberada.
 *
 * Exigência vazia (`requer: {}`, ou listas sem nenhum id) não bloqueia nada:
 * cadastro pela metade não deveria tirar uma solução do ar sem ninguém
 * entender por quê.
 *
 * A avaliação é de um nível só: se A exige B e B está travado por exigir C,
 * A ainda enxerga B como contratado. Encadeamento assim não existe no
 * catálogo real (as exigências apontam para modelos, que ninguém exige de
 * volta) e resolver o grafo inteiro custaria mais do que vale.
 */
export function bloqueioDe(produto: Produto, estado: EstadoContratacao): Bloqueio | undefined {
  const modelos = produto.requer?.modelos ?? [];
  const produtos = produto.requer?.produtos ?? [];
  if (modelos.length === 0 && produtos.length === 0) return undefined;

  const atendido =
    modelos.some((id) => estado.modelosAdotados.has(id)) ||
    produtos.some((id) => estado.produtosContratados.has(id));
  if (atendido) return undefined;

  return { motivo: 'prerequisito', modelos, produtos };
}

/**
 * Como o bloqueio é dito na tela. Recebe os nomes de fora porque o domínio
 * não conhece cadastro: id que não existe mais (modelo excluído depois de
 * virar pré-requisito) simplesmente não entra na frase, em vez de aparecer
 * como código cru para o gestor.
 */
export function descreverBloqueio(
  bloqueio: Bloqueio,
  nomeDoModelo: (id: string) => string | undefined,
  nomeDoProduto: (id: string) => string | undefined,
): string {
  const nomes = [
    ...bloqueio.modelos.map(nomeDoModelo),
    ...bloqueio.produtos.map(nomeDoProduto),
  ].filter((n): n is string => !!n);

  if (nomes.length === 0) return 'Depende de um item que saiu do catálogo. Fale com a regional.';
  if (nomes.length === 1) return `Disponível para quem contrata ${nomes[0]}.`;
  return `Disponível para quem contrata ${nomes.slice(0, -1).join(', ')} ou ${nomes.at(-1)}.`;
}

// ─── Conjunto de escolha única por ano ───────────────────────────

/** O que a unidade marcou dentro de um conjunto: anos por solução. */
export type SelecaoConjunto = ReadonlyMap<string, ReadonlySet<AnoEscolarId>>;

/** Um ano escolar disputado por mais de uma solução do conjunto. */
export interface Conflito {
  ano: AnoEscolarId;
  produtoIds: string[];
}

/**
 * Anos em que o conjunto foi marcado mais de uma vez.
 *
 * A tabela do gestor é de rádio por linha, então isso não acontece por
 * clique. Acontece quando o cadastro muda embaixo de uma escolha já feita:
 * duas soluções soltas que a unidade contratou no mesmo ano viram membros
 * do mesmo conjunto depois. Por isso o conflito é detectado e mostrado, não
 * resolvido em silêncio — escolher qual fica é decisão da unidade, e o
 * dinheiro é diferente em cada uma.
 */
export function conflitosDoConjunto(
  conjunto: Conjunto,
  selecao: SelecaoConjunto,
): Conflito[] {
  const porAno = new Map<AnoEscolarId, string[]>();
  for (const produtoId of conjunto.produtoIds) {
    for (const ano of selecao.get(produtoId) ?? []) {
      porAno.set(ano, [...(porAno.get(ano) ?? []), produtoId]);
    }
  }
  return ordenarAnos([...porAno.keys()])
    .filter((ano) => (porAno.get(ano)?.length ?? 0) > 1)
    .map((ano) => ({ ano, produtoIds: porAno.get(ano)! }));
}

/** Qual solução do conjunto ficou com este ano, se alguma. */
export function escolhidoNoAno(
  conjunto: Conjunto,
  selecao: SelecaoConjunto,
  ano: AnoEscolarId,
): string | undefined {
  const marcados = conjunto.produtoIds.filter((id) => selecao.get(id)?.has(ano));
  // Em conflito ninguém "ganhou": devolver o primeiro faria a tela mostrar
  // uma escolha que a unidade não fez.
  return marcados.length === 1 ? marcados[0] : undefined;
}
