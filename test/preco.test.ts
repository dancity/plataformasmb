import { describe, expect, it } from 'vitest';
import type { PrevisaoPorAno } from '../dominio/anosEscolares';
import { alunosNosAnos, anosOfertados, aplicarLicencas, totalDeAlunos } from '../dominio/anosEscolares';
import {
  calcularItem,
  calcularValorAnual,
  descreverPreco,
  reaisParaCentavos,
  somarCreditos,
} from '../dominio/preco';
import type { Precificacao } from '../dominio/tipos';

/**
 * Este arquivo existe para o cliente e o servidor nunca divergirem no valor.
 * Os números aqui são os do plano — a unidade fictícia de 1.230 alunos — e
 * servem de âncora: se um deles mudar sem alguém mudar a regra de propósito,
 * é porque a regra quebrou.
 */

const PREVISAO: PrevisaoPorAno = {
  EI1: 30, EI2: 40, EI3: 45, EI4: 47, EI5: 48,
  EF1: 88, EF2: 92, EF3: 90, EF4: 86, EF5: 84,
  EF6: 96, EF7: 94, EF8: 90, EF9: 92,
  EM1: 74, EM2: 68, EM3: 66,
};

const ANOS_INICIAIS = ['EF1', 'EF2', 'EF3', 'EF4', 'EF5'] as const;

describe('previsão de alunos', () => {
  it('soma a unidade inteira', () => {
    expect(totalDeAlunos(PREVISAO)).toBe(1230);
  });

  it('soma apenas os anos pedidos', () => {
    expect(alunosNosAnos(PREVISAO, ANOS_INICIAIS)).toBe(440);
  });

  it('trata ano ausente como zero, não como erro', () => {
    expect(alunosNosAnos({ EF1: 10 }, ['EF1', 'EF9'])).toBe(10);
  });

  it('esconde da escolha os anos que a unidade não vai ofertar', () => {
    const semMedio = { ...PREVISAO, EM1: 0, EM2: 0, EM3: 0 };
    const ofertados = anosOfertados(semMedio);
    expect(ofertados).toContain('EF9');
    expect(ofertados).not.toContain('EM1');
  });
});

describe('licenças ajustadas manualmente', () => {
  it('sem ajuste nenhum, a previsão sai intacta', () => {
    expect(aplicarLicencas(PREVISAO, undefined, ANOS_INICIAIS)).toEqual(PREVISAO);
  });

  it('sobrepõe só os anos ajustados, mantendo o resto da previsão', () => {
    const efetiva = aplicarLicencas(PREVISAO, { EF1: 50 }, ANOS_INICIAIS);
    expect(efetiva.EF1).toBe(50);
    expect(efetiva.EF2).toBe(PREVISAO.EF2); // não mexeu, continua a previsão
  });

  it('ignora ajuste para um ano fora da lista de anos considerados', () => {
    const efetiva = aplicarLicencas(PREVISAO, { EM1: 999 }, ANOS_INICIAIS);
    expect(efetiva.EM1).toBe(PREVISAO.EM1); // EM1 não está em ANOS_INICIAIS
  });

  it('descarta valor negativo, fracionário ou não numérico — cai na previsão', () => {
    const efetiva = aplicarLicencas(
      PREVISAO,
      { EF1: -5, EF2: 10.5, EF3: Number.NaN },
      ANOS_INICIAIS,
    );
    expect(efetiva.EF1).toBe(PREVISAO.EF1);
    expect(efetiva.EF2).toBe(PREVISAO.EF2);
    expect(efetiva.EF3).toBe(PREVISAO.EF3);
  });

  it('zero licenças é um ajuste válido — a solução some do cálculo daquele ano', () => {
    const efetiva = aplicarLicencas(PREVISAO, { EF1: 0 }, ANOS_INICIAIS);
    expect(efetiva.EF1).toBe(0);
  });

  it('muda o total cobrado quando a solução é por aluno', () => {
    const preco: Precificacao = { base: 'aluno', ciclo: 'anual', valor: 1000, meses: 12 };
    const previsaoEfetiva = aplicarLicencas(PREVISAO, { EF1: 50 }, ANOS_INICIAIS);
    const { alunos, valorAnual } = calcularItem(preco, previsaoEfetiva, ANOS_INICIAIS);
    // 440 - 88 (previsão real do EF1) + 50 (licenças ajustadas) = 402
    expect(alunos).toBe(402);
    expect(valorAnual).toBe(1000 * 402);
  });
});

describe('cálculo do valor anual', () => {
  it('aluno + mensal multiplica pelos meses faturados', () => {
    const preco: Precificacao = { base: 'aluno', ciclo: 'mensal', valor: 1500, meses: 10 };
    const { alunos, valorAnual } = calcularItem(preco, PREVISAO, ANOS_INICIAIS);
    expect(alunos).toBe(440);
    expect(valorAnual).toBe(6_600_000); // R$ 66.000,00
  });

  it('aluno + anual não multiplica por mês', () => {
    const preco: Precificacao = { base: 'aluno', ciclo: 'anual', valor: 4000, meses: 12 };
    const anos = ['EF1', 'EF2', 'EF3', 'EF4', 'EF5', 'EF6', 'EF7', 'EF8', 'EF9', 'EM1', 'EM2', 'EM3'] as const;
    const { alunos, valorAnual } = calcularItem(preco, PREVISAO, anos);
    expect(alunos).toBe(1020);
    expect(valorAnual).toBe(4_080_000); // R$ 40.800,00
  });

  it('escola + mensal cobra uma vez, não uma por ano escolar', () => {
    const preco: Precificacao = { base: 'escola', ciclo: 'mensal', valor: 120_000, meses: 12 };
    const um = calcularItem(preco, PREVISAO, ['EF1']);
    const doze = calcularItem(preco, PREVISAO, [
      'EF1', 'EF2', 'EF3', 'EF4', 'EF5', 'EF6', 'EF7', 'EF8', 'EF9', 'EM1', 'EM2', 'EM3',
    ]);
    expect(um.valorAnual).toBe(1_440_000); // R$ 14.400,00
    expect(doze.valorAnual).toBe(um.valorAnual);
  });

  it('nada selecionado custa zero', () => {
    const preco: Precificacao = { base: 'aluno', ciclo: 'mensal', valor: 1500, meses: 10 };
    expect(calcularItem(preco, PREVISAO, []).valorAnual).toBe(0);
    expect(calcularValorAnual({ ...preco, base: 'escola' }, { alunos: 0 })).toBe(0);
  });

  it('aplica o piso contratual quando a turma é pequena', () => {
    const preco: Precificacao = {
      base: 'aluno', ciclo: 'anual', valor: 10_000, meses: 12, minimoAlunos: 30,
    };
    expect(calcularValorAnual(preco, { alunos: 12 })).toBe(300_000); // cobra 30
    expect(calcularValorAnual(preco, { alunos: 45 })).toBe(450_000); // cobra 45
  });

  it('crédito soma a quantidade digitada em cada ano — não multiplica nada sozinho', () => {
    const preco: Precificacao = { base: 'credito', ciclo: 'anual', valor: 800, meses: 12 };
    // O gestor digitou 440 no total (1 crédito por aluno, mas isso é dele decidir).
    const um = calcularItem(preco, PREVISAO, ANOS_INICIAIS, {
      EF1: 88, EF2: 92, EF3: 90, EF4: 86, EF5: 84,
    });
    expect(um.alunos).toBe(440); // alunos e créditos são contas independentes
    expect(um.creditos).toBe(440);
    expect(um.valorAnual).toBe(800 * 440);
  });

  it('crédito varia por ano escolar — o mesmo serviço gasta números diferentes', () => {
    const preco: Precificacao = { base: 'credito', ciclo: 'anual', valor: 1000, meses: 12 };
    // 4 redações por aluno do fundamental (88 × 4 = 352), 8 na 3ª série (66 × 8 = 528).
    const { creditos, valorAnual } = calcularItem(preco, PREVISAO, ['EF1', 'EM3'], {
      EF1: 352,
      EM3: 528,
    });
    expect(creditos).toBe(880);
    expect(valorAnual).toBe(1000 * 880);
  });

  it('soma só os anos considerados, ignora o resto do mapa de créditos', () => {
    expect(somarCreditos({ EF1: 100, EM3: 999 }, ['EF1'])).toBe(100);
  });

  it('ano sem crédito digitado não entra na conta — não é decisão que o catálogo tome sozinho', () => {
    const preco: Precificacao = { base: 'credito', ciclo: 'anual', valor: 800, meses: 12 };
    expect(calcularValorAnual(preco, { alunos: 440 })).toBe(0);
    expect(calcularItem(preco, PREVISAO, ANOS_INICIAIS, {}).creditos).toBe(0);
    expect(calcularItem(preco, PREVISAO, ANOS_INICIAIS, { EF1: 0 }).creditos).toBe(0);
  });

  it('mantém tudo em inteiro: centavos não acumulam erro de float', () => {
    const preco: Precificacao = { base: 'aluno', ciclo: 'mensal', valor: 1090, meses: 11 };
    const valor = calcularValorAnual(preco, { alunos: 97 });
    expect(Number.isInteger(valor)).toBe(true);
    expect(valor).toBe(1090 * 97 * 11);
  });

  it('soma dos anos iniciais fecha com o total do segmento no plano', () => {
    const diagnostica: Precificacao = { base: 'aluno', ciclo: 'anual', valor: 4000, meses: 12 };
    const socio: Precificacao = { base: 'aluno', ciclo: 'anual', valor: 2200, meses: 12 };
    const robotica: Precificacao = { base: 'aluno', ciclo: 'mensal', valor: 1500, meses: 10 };

    const soma =
      calcularItem(diagnostica, PREVISAO, ANOS_INICIAIS).valorAnual +
      calcularItem(socio, PREVISAO, ANOS_INICIAIS).valorAnual +
      calcularItem(robotica, PREVISAO, ANOS_INICIAIS).valorAnual;

    expect(soma).toBe(9_328_000); // R$ 93.280,00
  });
});

/** O Intl separa "R$" do número com espaço não-quebrável (U+00A0). */
const semNbsp = (s: string) => s.replace(/ /g, ' ');

describe('entrada e saída de valores', () => {
  it('converte o que o admin digita em centavos', () => {
    expect(reaisParaCentavos('15,00')).toBe(1500);
    expect(reaisParaCentavos('R$ 1.200,50')).toBe(120_050);
    expect(reaisParaCentavos('9')).toBe(900);
    expect(() => reaisParaCentavos('abc')).toThrow();
  });

  it('descreve o preço do jeito que aparece na tela', () => {
    expect(semNbsp(descreverPreco({ base: 'aluno', ciclo: 'mensal', valor: 1500, meses: 10 }))).toBe(
      'R$ 15,00 / aluno / mês · 10 meses faturados',
    );
    expect(
      semNbsp(descreverPreco({ base: 'escola', ciclo: 'anual', valor: 1_440_000, meses: 12 })),
    ).toBe('R$ 14.400,00 / escola / ano');
  });
});
