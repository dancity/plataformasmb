import type { AnoEscolarId, PrevisaoPorAno } from './anosEscolares';
import { ordenarAnos } from './anosEscolares';
import type { Precificacao, Produto } from './tipos';

/**
 * Resolve o que uma unidade específica pode contratar de uma solução.
 *
 * Três estados por ano escolar, e a diferença entre eles é a informação mais
 * importante da tela de escolha:
 *   indisponível — não é oferecido, ou a unidade não oferta a série
 *   opcional     — o gestor decide
 *   obrigatório  — já vem marcado e travado
 *
 * O que é oferecido é nacional (`produto.habilitacao`); o que sobra depois de
 * cruzar com a previsão de alunos é que varia de unidade para unidade.
 */
export interface HabilitacaoResolvida {
  produtoId: string;
  /** Anos que o gestor pode marcar ou desmarcar. */
  opcionais: AnoEscolarId[];
  /** Anos que entram no pedido de qualquer forma. */
  obrigatorios: AnoEscolarId[];
  /** Preço vigente para esta unidade (social substitui o normal). */
  preco: Precificacao;
  /** Falso quando nenhum ano oferecido coincide com o que a unidade oferta. */
  disponivel: boolean;
}

export function resolverHabilitacao(
  produto: Produto,
  previsao: PrevisaoPorAno,
  unidadeSocial = false,
): HabilitacaoResolvida {
  const opcionais: AnoEscolarId[] = [];
  const obrigatorios: AnoEscolarId[] = [];

  for (const [ano, estado] of Object.entries(produto.habilitacao ?? {})) {
    // Série que a unidade não vai ofertar não aparece na escolha.
    if ((previsao[ano as AnoEscolarId] ?? 0) <= 0) continue;
    if (estado === 'obrigatorio') obrigatorios.push(ano as AnoEscolarId);
    else if (estado === 'opcional') opcionais.push(ano as AnoEscolarId);
  }

  // Preço social substitui o preço normal por completo — é a política
  // institucional pra unidade social, não um desconto sobre o valor de tabela.
  const preco =
    unidadeSocial && produto.precoSocialHabilitado && produto.precificacaoSocial
      ? produto.precificacaoSocial
      : produto.precificacao;

  return {
    produtoId: produto.id,
    opcionais: ordenarAnos(opcionais),
    obrigatorios: ordenarAnos(obrigatorios),
    preco,
    disponivel: opcionais.length > 0 || obrigatorios.length > 0,
  };
}

/**
 * Anos que devem constar no item do pedido: os obrigatórios sempre, mais os
 * opcionais que o gestor marcou. Marcação em ano não habilitado é descartada —
 * o cliente não decide o que é permitido.
 */
export function anosEfetivos(
  habilitacao: HabilitacaoResolvida,
  marcadosPeloGestor: readonly AnoEscolarId[],
): AnoEscolarId[] {
  const permitidos = new Set(habilitacao.opcionais);
  const efetivos = new Set(habilitacao.obrigatorios);
  for (const ano of marcadosPeloGestor) {
    if (permitidos.has(ano)) efetivos.add(ano);
  }
  return ordenarAnos([...efetivos]);
}

/** Uma solução com anos obrigatórios não pode ser recusada pelo gestor. */
export function podeRecusar(habilitacao: HabilitacaoResolvida): boolean {
  return habilitacao.obrigatorios.length === 0;
}
