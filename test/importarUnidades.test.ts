import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analisarColagem } from '../src/lib/importarUnidades';

const PLANILHA_REAL = readFileSync(
  fileURLToPath(new URL('./fixtures/unidades.tsv', import.meta.url)),
  'utf-8',
);

/**
 * `test/fixtures/unidades.tsv` é a planilha real da rede (colada como veio
 * do Excel: cabeçalho, unidade repetida uma linha por ano escolar). Se
 * qualquer uma das 95 unidades parar de ser reconhecida, é porque o
 * parser — não a planilha — mudou.
 */
describe('analisarColagem — planilha oficial da rede', () => {
  it('reconhece as 95 unidades sem erro', () => {
    const { prontas, erros } = analisarColagem(PLANILHA_REAL);
    expect(erros).toEqual([]);
    expect(prontas).toHaveLength(95);
  });

  it('colapsa as linhas repetidas da mesma unidade mantendo os dados', () => {
    const { prontas } = analisarColagem(PLANILHA_REAL);
    const lancisio = prontas.find((u) => u.nome.startsWith('Aprendizado Marista Padre Lancisio'));
    expect(lancisio).toEqual({
      nome: 'Aprendizado Marista Padre Lancisio - GO',
      codigo: 'aprendizado-marista-padre-lancisio-go',
      regionalId: 'brasilia',
      tipo: 'social',
      mantenedora: 'UBEE',
    });
  });

  it('gera códigos sem acento e sem colisão entre as 95', () => {
    const { prontas } = analisarColagem(PLANILHA_REAL);
    const codigos = new Set(prontas.map((u) => u.codigo));
    expect(codigos.size).toBe(prontas.length);
    for (const codigo of codigos) expect(codigo).toMatch(/^[a-z0-9-]+$/);
  });

  it('conta paga e social igual à planilha', () => {
    const { prontas } = analisarColagem(PLANILHA_REAL);
    expect(prontas.filter((u) => u.tipo === 'paga')).toHaveLength(63);
    expect(prontas.filter((u) => u.tipo === 'social')).toHaveLength(32);
  });
});

describe('analisarColagem — casos e formatos', () => {
  it('aceita separado por vírgula, sem cabeçalho', () => {
    const { prontas, erros } = analisarColagem(
      'Colégio Teste - SP,ABEC,São Paulo,Pago',
    );
    expect(erros).toEqual([]);
    expect(prontas).toEqual([
      { nome: 'Colégio Teste - SP', codigo: 'colegio-teste-sp', regionalId: 'sao-paulo', tipo: 'paga', mantenedora: 'ABEC' },
    ]);
  });

  it('marca regional não reconhecida em vez de adivinhar', () => {
    const { prontas, erros } = analisarColagem('Escola X\tABEC\tNorte\tPago');
    expect(prontas).toEqual([]);
    expect(erros).toEqual(['"Escola X": regional não reconhecida.']);
  });

  it('marca mantenedora não reconhecida', () => {
    const { erros } = analisarColagem('Escola X\tXPTO\tSão Paulo\tPago');
    expect(erros).toEqual(['"Escola X": mantenedora não reconhecida.']);
  });

  it('marca tipo não reconhecido', () => {
    const { erros } = analisarColagem('Escola X\tABEC\tSão Paulo\tGratuito');
    expect(erros).toEqual(['"Escola X": tipo (pago ou social) não reconhecido.']);
  });

  it('mesma unidade com dados iguais em várias linhas: uma só, sem erro', () => {
    const texto = ['Escola X\tABEC\tSão Paulo\tPago', 'Escola X\tABEC\tSão Paulo\tPago'].join('\n');
    const { prontas, erros } = analisarColagem(texto);
    expect(erros).toEqual([]);
    expect(prontas).toHaveLength(1);
  });

  it('mesma unidade com dados divergentes entre linhas: erro, não entra pronta', () => {
    const texto = ['Escola X\tABEC\tSão Paulo\tPago', 'Escola X\tABEC\tSão Paulo\tSocial'].join('\n');
    const { prontas, erros } = analisarColagem(texto);
    expect(prontas).toEqual([]);
    expect(erros).toEqual(['"Escola X" aparece com dados diferentes em mais de uma linha.']);
  });

  it('ignora linhas vazias e o cabeçalho', () => {
    const texto = ['Unidade\tMantenedora\tRegional\tPago | Social', '', 'Escola X\tABEC\tSão Paulo\tPago'].join(
      '\n',
    );
    const { prontas, erros } = analisarColagem(texto);
    expect(erros).toEqual([]);
    expect(prontas).toHaveLength(1);
  });

  it('texto vazio não dá erro nem unidade', () => {
    expect(analisarColagem('')).toEqual({ prontas: [], erros: [] });
  });
});
