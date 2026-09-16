import { describe, expect, it } from 'vitest';
import {
  bloqueioDe,
  conflitosDoConjunto,
  descreverBloqueio,
  escolhidoNoAno,
  estadoVazio,
} from '@dominio/vinculos';
import type { EstadoContratacao } from '@dominio/vinculos';
import type { Conjunto, Produto } from '@dominio/tipos';

function produto(requer?: Produto['requer']): Produto {
  return {
    id: 'evo-jornada',
    cicloId: 'c2027',
    nome: 'Evo Jornada',
    fornecedorId: 'evo',
    categoria: 'Outros',
    descricao: '',
    precificacao: { base: 'aluno', ciclo: 'anual', valor: 5000, meses: 12 },
    habilitacao: { EF6: 'opcional' },
    ordem: 1,
    visibilidade: 'publicado',
    criadoEm: '2027-01-01T00:00:00.000Z',
    atualizadoEm: '2027-01-01T00:00:00.000Z',
    ...(requer ? { requer } : {}),
  };
}

function estado(parcial: Partial<EstadoContratacao>): EstadoContratacao {
  return { ...estadoVazio(), ...parcial };
}

describe('pré-requisito', () => {
  it('solução sem exigência nunca trava', () => {
    expect(bloqueioDe(produto(), estadoVazio())).toBeUndefined();
  });

  it('exigência vazia não trava — cadastro pela metade não tira solução do ar', () => {
    expect(bloqueioDe(produto({}), estadoVazio())).toBeUndefined();
    expect(bloqueioDe(produto({ modelos: [] }), estadoVazio())).toBeUndefined();
  });

  it('trava quando nenhum dos modelos exigidos foi adotado', () => {
    const b = bloqueioDe(produto({ modelos: ['modelo-b', 'modelo-c'] }), estadoVazio());
    expect(b).toEqual({ motivo: 'prerequisito', modelos: ['modelo-b', 'modelo-c'], produtos: [] });
  });

  it('basta UM dos exigidos: é ou, não e', () => {
    const p = produto({ modelos: ['modelo-b', 'modelo-c'] });
    expect(bloqueioDe(p, estado({ modelosAdotados: new Set(['modelo-c']) }))).toBeUndefined();
  });

  it('modelo adotado que não está na lista não libera', () => {
    const p = produto({ modelos: ['modelo-b'] });
    expect(bloqueioDe(p, estado({ modelosAdotados: new Set(['modelo-a']) }))).toBeDefined();
  });

  it('exigência de produto conta contratação de produto', () => {
    const p = produto({ produtos: ['plataforma-leitura'] });
    expect(bloqueioDe(p, estado({ produtosContratados: new Set(['plataforma-leitura']) }))).toBeUndefined();
    expect(bloqueioDe(p, estadoVazio())).toBeDefined();
  });

  it('modelo e produto somam na mesma exigência — qualquer um dos dois serve', () => {
    const p = produto({ modelos: ['modelo-b'], produtos: ['leitura'] });
    expect(bloqueioDe(p, estado({ produtosContratados: new Set(['leitura']) }))).toBeUndefined();
    expect(bloqueioDe(p, estado({ modelosAdotados: new Set(['modelo-b']) }))).toBeUndefined();
    expect(bloqueioDe(p, estadoVazio())).toBeDefined();
  });
});

describe('como o bloqueio é dito', () => {
  const nome = (mapa: Record<string, string>) => (id: string) => mapa[id];

  it('um item só', () => {
    const b = bloqueioDe(produto({ modelos: ['modelo-b'] }), estadoVazio())!;
    expect(descreverBloqueio(b, nome({ 'modelo-b': 'Modelo B' }), () => undefined)).toBe(
      'Disponível para quem contrata Modelo B.',
    );
  });

  it('dois itens viram "ou"', () => {
    const b = bloqueioDe(produto({ modelos: ['modelo-b', 'modelo-c'] }), estadoVazio())!;
    expect(
      descreverBloqueio(b, nome({ 'modelo-b': 'Modelo B', 'modelo-c': 'Modelo C' }), () => undefined),
    ).toBe('Disponível para quem contrata Modelo B ou Modelo C.');
  });

  it('id que sumiu do catálogo não vira código cru na tela', () => {
    const b = bloqueioDe(produto({ modelos: ['modelo-b', 'excluido'] }), estadoVazio())!;
    expect(descreverBloqueio(b, nome({ 'modelo-b': 'Modelo B' }), () => undefined)).toBe(
      'Disponível para quem contrata Modelo B.',
    );
  });

  it('quando nada do exigido existe mais, diz isso em vez de uma frase vazia', () => {
    const b = bloqueioDe(produto({ modelos: ['sumiu'] }), estadoVazio())!;
    expect(descreverBloqueio(b, () => undefined, () => undefined)).toContain('saiu do catálogo');
  });
});

// ─── Conjunto de escolha única ───────────────────────────────────

const ZOOM: Conjunto = {
  id: 'zoom',
  cicloId: 'c2027',
  nome: 'ZOOM',
  descricao: '',
  produtoIds: ['pensamento', 'jornada-z'],
  visibilidade: 'publicado',
  criadoEm: '2027-01-01T00:00:00.000Z',
  atualizadoEm: '2027-01-01T00:00:00.000Z',
};

const sel = (entradas: Record<string, string[]>) =>
  new Map(Object.entries(entradas).map(([id, anos]) => [id, new Set(anos as never[])]));

describe('conjunto de escolha única por ano', () => {
  it('trilhas em anos diferentes convivem — é o caso normal', () => {
    const s = sel({ pensamento: ['EF6', 'EF7'], 'jornada-z': ['EF8', 'EF9'] });
    expect(conflitosDoConjunto(ZOOM, s)).toEqual([]);
  });

  it('mesmo ano em duas trilhas é conflito', () => {
    const s = sel({ pensamento: ['EF6'], 'jornada-z': ['EF6'] });
    expect(conflitosDoConjunto(ZOOM, s)).toEqual([
      { ano: 'EF6', produtoIds: ['pensamento', 'jornada-z'] },
    ]);
  });

  it('conflitos saem na ordem pedagógica, não na de inserção', () => {
    const s = sel({ pensamento: ['EM1', 'EF6'], 'jornada-z': ['EM1', 'EF6'] });
    expect(conflitosDoConjunto(ZOOM, s).map((c) => c.ano)).toEqual(['EF6', 'EM1']);
  });

  it('nenhuma trilha marcada no ano não é conflito — é uma escolha', () => {
    expect(conflitosDoConjunto(ZOOM, sel({ pensamento: [], 'jornada-z': [] }))).toEqual([]);
  });

  it('produto de fora do conjunto não entra na conta', () => {
    const s = sel({ pensamento: ['EF6'], outro: ['EF6'] });
    expect(conflitosDoConjunto(ZOOM, s)).toEqual([]);
  });

  it('escolhidoNoAno devolve a trilha marcada', () => {
    const s = sel({ pensamento: ['EF6'], 'jornada-z': ['EF7'] });
    expect(escolhidoNoAno(ZOOM, s, 'EF6')).toBe('pensamento');
    expect(escolhidoNoAno(ZOOM, s, 'EF7')).toBe('jornada-z');
  });

  it('em conflito ninguém ganhou: a tela não pode mostrar escolha que não foi feita', () => {
    const s = sel({ pensamento: ['EF6'], 'jornada-z': ['EF6'] });
    expect(escolhidoNoAno(ZOOM, s, 'EF6')).toBeUndefined();
  });

  it('ano sem nada marcado não tem escolhido', () => {
    expect(escolhidoNoAno(ZOOM, sel({ pensamento: ['EF6'] }), 'EF9')).toBeUndefined();
  });
});
