import type { AnoEscolarId, PrevisaoPorAno } from './anosEscolares';
import { alunosNosAnos } from './anosEscolares';
import type { Centavos, Precificacao } from './tipos';

/**
 * Normalização de preço. Quatro combinações de base e ciclo entram, um único
 * número sai: valor estimado por ANO, em centavos. É o único número comparável
 * entre soluções e o único que a regional consegue somar.
 *
 * Esta função é a fonte da verdade e roda nos dois lados: no cliente para dar
 * resposta imediata, no servidor para gravar. O teste em test/preco.test.ts
 * existe justamente para os dois nunca divergirem.
 */

export interface ContextoCalculo {
  /** Alunos alcançados pela seleção. Ignorado quando base = 'escola'. */
  alunos: number;
  /** Turmas alcançadas. Só usado quando base = 'turma'. */
  turmas?: number;
  /**
   * Total de créditos já somado ano a ano (ver `totalDeCreditos`). Não é um
   * único multiplicador porque o múltiplo pode variar por ano escolar — só
   * usado quando base = 'credito'.
   */
  creditos?: number;
}

export function calcularValorAnual(preco: Precificacao, ctx: ContextoCalculo): Centavos {
  const multiplicador = quantidadeCobravel(preco, ctx);
  if (multiplicador <= 0) return 0;

  const vezes = preco.ciclo === 'mensal' ? preco.meses : 1;
  return preco.valor * multiplicador * vezes;
}

/**
 * Quantas unidades de cobrança entram na conta.
 * Base 'escola' vale 1 independentemente de quantos anos foram marcados — é
 * licença da unidade, e marcar mais anos não aumenta a fatura.
 */
export function quantidadeCobravel(preco: Precificacao, ctx: ContextoCalculo): number {
  switch (preco.base) {
    case 'escola':
      return ctx.alunos > 0 || (ctx.turmas ?? 0) > 0 ? 1 : 0;
    case 'turma':
      return ctx.turmas ?? 0;
    case 'aluno': {
      if (ctx.alunos <= 0) return 0;
      // Piso contratual: abaixo do mínimo, cobra-se o mínimo.
      return preco.minimoAlunos ? Math.max(ctx.alunos, preco.minimoAlunos) : ctx.alunos;
    }
    case 'credito':
      // Sem crédito somado, não há o que cobrar — é decisão do gestor, ano a
      // ano, não um número que o catálogo já traz pronto.
      return ctx.creditos ?? 0;
  }
}

/**
 * Soma, ano a ano, alunos × múltiplo de créditos daquele ano — nunca um
 * multiplicador só para a solução inteira. O mesmo serviço gasta créditos
 * diferentes por ano (poucas redações corrigidas no fundamental, muitas na
 * 3ª série do médio), e é assim que a rede negocia: por ano, não por aluno
 * solto.
 */
export function totalDeCreditos(
  previsao: PrevisaoPorAno,
  anos: readonly AnoEscolarId[],
  creditosPorAno: PrevisaoPorAno,
): number {
  return anos.reduce((soma, ano) => {
    const multiplo = creditosPorAno[ano];
    if (!multiplo) return soma;
    return soma + Math.round((previsao[ano] ?? 0) * multiplo);
  }, 0);
}

/** Calcula direto a partir da previsão e dos anos marcados. */
export function calcularItem(
  preco: Precificacao,
  previsao: PrevisaoPorAno,
  anosSelecionados: readonly AnoEscolarId[],
  creditosPorAno?: PrevisaoPorAno,
): { alunos: number; creditos: number; valorAnual: Centavos } {
  const alunos = alunosNosAnos(previsao, anosSelecionados);
  const creditos =
    preco.base === 'credito' ? totalDeCreditos(previsao, anosSelecionados, creditosPorAno ?? {}) : 0;
  return { alunos, creditos, valorAnual: calcularValorAnual(preco, { alunos, creditos }) };
}

// ─── Apresentação ────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatarBRL(centavos: Centavos): string {
  return BRL.format(centavos / 100);
}

/** Sem centavos — para totais grandes em cabeçalho e resumo. */
export function formatarBRLcurto(centavos: Centavos): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(centavos / 100);
}

const ROTULO_BASE: Record<Precificacao['base'], string> = {
  aluno: 'aluno',
  escola: 'escola',
  turma: 'turma',
  credito: 'crédito',
};

/** Ex.: "R$ 15,00 / aluno / mês · 10 meses faturados" */
export function descreverPreco(preco: Precificacao): string {
  const unidade = `${formatarBRL(preco.valor)} / ${ROTULO_BASE[preco.base]}`;
  if (preco.ciclo === 'anual') return `${unidade} / ano`;
  return `${unidade} / mês · ${preco.meses} ${preco.meses === 1 ? 'mês' : 'meses'} faturados`;
}

/** Ex.: "1×" ou "0,5×" — o rótulo curto de uma opção de múltiplo de crédito. */
export function rotularMultiploCredito(multiplo: number): string {
  return `${multiplo.toLocaleString('pt-BR')}×`;
}

/** Converte "1.234,56" ou "1234.56" digitado pelo admin em centavos. */
export function reaisParaCentavos(entrada: string): Centavos {
  const limpo = entrada
    .trim()
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const valor = Number(limpo);
  if (!Number.isFinite(valor)) throw new Error(`Valor inválido: ${entrada}`);
  return Math.round(valor * 100);
}
