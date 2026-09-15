import { describe, expect, it } from 'vitest';
import { bloqueioDe, descreverBloqueio, estadoVazio } from '@dominio/vinculos';
import type { EstadoContratacao } from '@dominio/vinculos';
import type { Produto } from '@dominio/tipos';

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
