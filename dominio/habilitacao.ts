import type { AnoEscolarId, PrevisaoPorAno } from './anosEscolares';
import { ordenarAnos } from './anosEscolares';
import type { Precificacao, Produto, RegraHabilitacao } from './tipos';

/**
 * Resolve o que uma unidade específica pode contratar de uma solução.
 *
 * Três estados por ano escolar, e a diferença entre eles é a informação mais
 * importante da tela de escolha:
 *   indisponível — não é oferecido nesta regional (mostra explicação, não caixa)
 *   opcional     — o gestor decide
 *   obrigatório  — já vem marcado e travado
 */
export interface HabilitacaoResolvida {
  produtoId: string;
  /** Anos que o gestor pode marcar ou desmarcar. */
  opcionais: AnoEscolarId[];
  /** Anos que entram no pedido de qualquer forma. */
  obrigatorios: AnoEscolarId[];
  /** Preço vigente para esta regional (override da regra, se houver). */
  preco: Precificacao;
  /** Falso quando nenhuma regra alcança os anos ofertados pela unidade. */
  disponivel: boolean;
}

export function resolverHabilitacao(
  produto: Produto,
  regras: readonly RegraHabilitacao[],
  regionalId: string,
  previsao: PrevisaoPorAno,
): HabilitacaoResolvida {
  const opcionais: AnoEscolarId[] = [];
  const obrigatorios: AnoEscolarId[] = [];
  let preco = produto.precificacao;

  for (const regra of regras) {
    if (regra.produtoId !== produto.id) continue;
    if (regra.regionalId !== regionalId) continue;
    // Série que a unidade não vai ofertar não aparece na escolha.
    if ((previsao[regra.anoEscolar] ?? 0) <= 0) continue;

    if (regra.obrigatoriedade === 'obrigatorio') obrigatorios.push(regra.anoEscolar);
    else opcionais.push(regra.anoEscolar);

    // O override é por regional; a primeira regra da regional já o define.
    if (regra.precoOverride) preco = regra.precoOverride;
  }

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
