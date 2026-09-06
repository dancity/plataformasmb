import { describe, expect, it } from 'vitest';
import { calcularLinhas, computarItem, resolverItensDoModelo } from '@/lib/pedido';
import type { ContextoPedido } from '@/lib/pedido';
import type { Ciclo, Modelo, Produto, RegraHabilitacao, Unidade } from '@dominio/tipos';

/**
 * `resolverItensDoModelo` é o coração da funcionalidade de Modelos: decide,
 * para esta unidade agora, o que aplicar um pacote significa. Sem rede — só
 * a resolução pura, a mesma conta que o botão "aplicar modelo" dispara.
 */

const CICLO: Ciclo = {
  id: 'c2027',
  nome: 'Contratação 2027',
  anoAlvo: 2027,
  estado: 'aberto',
  aberturaEm: '2027-01-01T00:00:00.000Z',
  prazoGestor: '2027-03-01T00:00:00.000Z',
  prazoRegional: '2027-04-01T00:00:00.000Z',
  criadoEm: '2027-01-01T00:00:00.000Z',
};

const UNIDADE: Unidade = {
  id: 'boa-viagem',
  nome: 'Colégio Marista Boa Viagem',
  codigo: 'boa-viagem',
  regionalId: 'recife',
  ativa: true,
};

function produto(parcial: Partial<Produto> & Pick<Produto, 'id' | 'nome' | 'precificacao'>): Produto {
  return {
    cicloId: CICLO.id,
    fornecedorId: 'editora-alfa',
    categoria: 'Avaliação',
    descricao: '',
    ordem: 10,
    visibilidade: 'publicado',
    criadoEm: CICLO.criadoEm,
    atualizadoEm: CICLO.criadoEm,
    ...parcial,
  };
}

const PRODUTO_ALUNO = produto({
  id: 'diagnostica',
  nome: 'Avaliação Diagnóstica',
  precificacao: { base: 'aluno', ciclo: 'anual', valor: 4000, meses: 12 },
});

const PRODUTO_CREDITO = produto({
  id: 'redacao',
  nome: 'Correção de Redação',
  categoria: 'Simulados',
  precificacao: { base: 'credito', ciclo: 'mensal', valor: 500, meses: 10 },
});

// Não tem regra nenhuma nesta regional — fica indisponível.
const PRODUTO_SEM_REGRA = produto({
  id: 'robotica',
  nome: 'Robótica Educacional',
  categoria: 'Robótica e tecnologia',
  precificacao: { base: 'aluno', ciclo: 'mensal', valor: 1500, meses: 10 },
});

const REGRAS: RegraHabilitacao[] = [
  {
    id: 'recife_EF1',
    produtoId: 'diagnostica',
    regionalId: 'recife',
    anoEscolar: 'EF1',
    obrigatoriedade: 'obrigatorio',
  },
  {
    id: 'recife_EF2',
    produtoId: 'diagnostica',
    regionalId: 'recife',
    anoEscolar: 'EF2',
    obrigatoriedade: 'opcional',
  },
  {
    id: 'recife_EF1_redacao',
    produtoId: 'redacao',
    regionalId: 'recife',
    anoEscolar: 'EF1',
    obrigatoriedade: 'opcional',
  },
  {
    id: 'recife_EF2_redacao',
    produtoId: 'redacao',
    regionalId: 'recife',
    anoEscolar: 'EF2',
    obrigatoriedade: 'opcional',
  },
];

function contexto(): ContextoPedido {
  return {
    ciclo: CICLO,
    unidade: UNIDADE,
    previsao: { EF1: 88, EF2: 92 },
    previsaoConfirmada: true,
    produtos: [PRODUTO_ALUNO, PRODUTO_CREDITO, PRODUTO_SEM_REGRA],
    regras: REGRAS,
    fornecedores: new Map([
      ['editora-alfa', 'Editora Alfa'],
      ['instituto-beta', 'Instituto Beta'],
    ]),
    pedido: null,
    itens: new Map(),
  };
}

describe('resolverItensDoModelo', () => {
  it('respeita os anos escolhidos no modelo, e obrigatório entra de qualquer jeito', () => {
    const ctx = contexto();
    const linhas = calcularLinhas(ctx, 'recife');
    const modelo: Modelo = {
      id: 'm1',
      cicloId: CICLO.id,
      nome: 'Avaliações padrão',
      descricao: '',
      categoria: 'Geral',
      itens: [
        // EF1 é obrigatório nesta regional — nem precisava estar aqui pra entrar.
        { produtoId: 'diagnostica', anos: ['EF2'] },
        // Pedido só EF1: EF2 também é opcional aqui, mas o modelo não marcou.
        { produtoId: 'redacao', anos: ['EF1'] },
      ],
      visibilidade: 'publicado',
      criadoEm: CICLO.criadoEm,
      atualizadoEm: CICLO.criadoEm,
    };

    const { itens, indisponiveis } = resolverItensDoModelo(modelo, linhas, ctx);

    expect(indisponiveis).toEqual([]);
    expect(itens).toHaveLength(2);

    const diagnostica = itens.find((i) => i.produto.id === 'diagnostica')!;
    const itemDiagnostica = computarItem(
      diagnostica.produto,
      diagnostica.habilitacao,
      diagnostica.fornecedorNome,
      diagnostica.previsao,
      diagnostica.decisao,
    );
    // EF1 entra mesmo sem estar nos anos do modelo — é obrigatório aqui.
    expect(itemDiagnostica.anosSelecionados).toEqual(['EF1', 'EF2']);

    const redacao = itens.find((i) => i.produto.id === 'redacao')!;
    const itemRedacao = computarItem(
      redacao.produto,
      redacao.habilitacao,
      redacao.fornecedorNome,
      redacao.previsao,
      redacao.decisao,
    );
    // EF2 NÃO entra: é opcional aqui, mas o modelo só pediu EF1.
    expect(itemRedacao.anosSelecionados).toEqual(['EF1']);
    expect(itemRedacao.creditosPorAno).toEqual({ EF1: 88 });
  });

  it('lista como indisponível o produto sem regra nesta regional', () => {
    const ctx = contexto();
    const linhas = calcularLinhas(ctx, 'recife');
    const modelo: Modelo = {
      id: 'm2',
      cicloId: CICLO.id,
      nome: 'Pacote com robótica',
      descricao: '',
      categoria: 'Geral',
      itens: [
        { produtoId: 'diagnostica', anos: ['EF1', 'EF2'] },
        { produtoId: 'robotica', anos: ['EF1', 'EF2'] },
      ],
      visibilidade: 'publicado',
      criadoEm: CICLO.criadoEm,
      atualizadoEm: CICLO.criadoEm,
    };

    const { itens, indisponiveis } = resolverItensDoModelo(modelo, linhas, ctx);

    expect(itens.map((i) => i.produto.id)).toEqual(['diagnostica']);
    expect(indisponiveis).toEqual(['Robótica Educacional']);
  });

  it('lista como indisponível quando os anos escolhidos não cruzam com nada habilitado aqui', () => {
    const ctx = contexto();
    const linhas = calcularLinhas(ctx, 'recife');
    const modelo: Modelo = {
      id: 'm4',
      cicloId: CICLO.id,
      nome: 'Modelo fora de ano',
      descricao: '',
      categoria: 'Geral',
      // Redação não tem obrigatório nesta regional, e EM1 não é opcional pra
      // ela aqui (só EF1/EF2 são) — nada pra marcar.
      itens: [{ produtoId: 'redacao', anos: ['EM1'] }],
      visibilidade: 'publicado',
      criadoEm: CICLO.criadoEm,
      atualizadoEm: CICLO.criadoEm,
    };

    const { itens, indisponiveis } = resolverItensDoModelo(modelo, linhas, ctx);

    expect(itens).toEqual([]);
    expect(indisponiveis).toEqual(['Correção de Redação']);
  });

  it('produto removido do catálogo entra no indisponível pelo id, sem quebrar', () => {
    const ctx = contexto();
    const linhas = calcularLinhas(ctx, 'recife');
    const modelo: Modelo = {
      id: 'm3',
      cicloId: CICLO.id,
      nome: 'Modelo com produto excluído',
      descricao: '',
      categoria: 'Geral',
      itens: [{ produtoId: 'produto-que-nao-existe-mais', anos: ['EF1'] }],
      visibilidade: 'publicado',
      criadoEm: CICLO.criadoEm,
      atualizadoEm: CICLO.criadoEm,
    };

    const { itens, indisponiveis } = resolverItensDoModelo(modelo, linhas, ctx);

    expect(itens).toEqual([]);
    expect(indisponiveis).toEqual(['produto-que-nao-existe-mais']);
  });
});

/**
 * Um pacote de modelo é fechado: o item que sai de `aplicarModelo` precisa
 * vir carimbado com a origem — é esse carimbo que trava a edição solução
 * por solução na etapa de escolha. Uma decisão manual (`salvarDecisao`,
 * que também passa por `computarItem`, só sem o 6º argumento) nunca carrega
 * esse carimbo.
 */
describe('computarItem — carimbo de origem do modelo', () => {
  const ctx = contexto();
  const linhas = calcularLinhas(ctx, 'recife');
  const linhaDiagnostica = linhas.find((l) => l.produto.id === 'diagnostica')!;

  it('carimba origemModeloId e origemModeloNome quando aplicado via modelo', () => {
    const item = computarItem(
      linhaDiagnostica.produto,
      linhaDiagnostica.habilitacao,
      'Editora Alfa',
      ctx.previsao,
      { anos: linhaDiagnostica.habilitacao.opcionais, recusado: false },
      { id: 'm1', nome: 'Avaliações padrão' },
    );

    expect(item.origemModeloId).toBe('m1');
    expect(item.origemModeloNome).toBe('Avaliações padrão');
  });

  it('não carimba nada numa decisão manual, sem o 6º argumento', () => {
    const item = computarItem(
      linhaDiagnostica.produto,
      linhaDiagnostica.habilitacao,
      'Editora Alfa',
      ctx.previsao,
      { anos: linhaDiagnostica.habilitacao.opcionais, recusado: false },
    );

    expect(item.origemModeloId).toBeUndefined();
    expect(item.origemModeloNome).toBeUndefined();
  });
});
