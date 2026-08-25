import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Regra sem teste é regra que afrouxa sozinha na próxima alteração.
 *
 * Roda contra o emulador:  npm run test:regras
 *
 * As duas ameaças do plano viram teste aqui:
 *   1. enviar pedido em nome de outra unidade
 *   2. ler o orçamento de unidade alheia
 */

let ambiente: RulesTestEnvironment;

const RECIFE = 'reg_recife';
const CURITIBA = 'reg_curitiba';
const BOA_VIAGEM = 'un_boa_viagem';
const OUTRA = 'un_casa_forte';

const claims = (papel: string, extras: Record<string, string> = {}) => ({ papel, ...extras });

function gestorBoaViagem() {
  return ambiente
    .authenticatedContext('u_gestor', claims('gestor_unidade', { unidadeId: BOA_VIAGEM, regionalId: RECIFE }))
    .firestore();
}
function gestorOutraUnidade() {
  return ambiente
    .authenticatedContext('u_outro', claims('gestor_unidade', { unidadeId: OUTRA, regionalId: RECIFE }))
    .firestore();
}
function regionalRecife() {
  return ambiente
    .authenticatedContext('u_regional', claims('gestor_regional', { regionalId: RECIFE }))
    .firestore();
}
function regionalCuritiba() {
  return ambiente
    .authenticatedContext('u_curitiba', claims('gestor_regional', { regionalId: CURITIBA }))
    .firestore();
}
function administrador() {
  return ambiente.authenticatedContext('u_admin', claims('admin')).firestore();
}
function semClaims() {
  return ambiente.authenticatedContext('u_novo', {}).firestore();
}
function deslogado() {
  return ambiente.unauthenticatedContext().firestore();
}

beforeAll(async () => {
  ambiente = await initializeTestEnvironment({
    projectId: 'plataformas-marista-teste',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await ambiente?.cleanup();
});

beforeEach(async () => {
  await ambiente.clearFirestore();
  await ambiente.withSecurityRulesDisabled(async (ctx) => {
    const bd = ctx.firestore();
    await setDoc(doc(bd, 'unidades', BOA_VIAGEM), { nome: 'Boa Viagem', regionalId: RECIFE });
    await setDoc(doc(bd, 'unidades', OUTRA), { nome: 'Casa Forte', regionalId: RECIFE });

    await setDoc(doc(bd, 'pedidos', `c2027_${BOA_VIAGEM}`), {
      cicloId: 'c2027',
      unidadeId: BOA_VIAGEM,
      regionalId: RECIFE,
      estado: 'rascunho',
      versao: 1,
      totais: { obrigatorio: 0, opcional: 0, total: 0 },
    });
    await setDoc(doc(bd, 'pedidos', `c2027_${OUTRA}`), {
      cicloId: 'c2027',
      unidadeId: OUTRA,
      regionalId: RECIFE,
      estado: 'enviado',
      versao: 1,
      totais: { obrigatorio: 0, opcional: 0, total: 16_250_000 },
    });

    await setDoc(doc(bd, 'convites', 'cv1'), { tokenHash: 'abc', unidadeId: BOA_VIAGEM });
    await setDoc(doc(bd, 'usuarios', 'u_gestor'), {
      email: 'g@x.com', papel: 'gestor_unidade', unidadeId: BOA_VIAGEM, regionalId: RECIFE,
    });
  });
});

describe('quem não tem vínculo não passa', () => {
  it('deslogado não lê catálogo', async () => {
    await assertFails(getDoc(doc(deslogado(), 'unidades', BOA_VIAGEM)));
  });

  it('autenticado sem papel não lê catálogo', async () => {
    await assertFails(getDoc(doc(semClaims(), 'unidades', BOA_VIAGEM)));
  });
});

describe('orçamento de unidade alheia', () => {
  it('gestor lê o pedido da própria unidade', async () => {
    await assertSucceeds(getDoc(doc(gestorBoaViagem(), 'pedidos', `c2027_${BOA_VIAGEM}`)));
  });

  it('gestor NÃO lê o pedido de outra unidade', async () => {
    await assertFails(getDoc(doc(gestorBoaViagem(), 'pedidos', `c2027_${OUTRA}`)));
  });

  it('regional lê os pedidos da própria regional', async () => {
    await assertSucceeds(getDoc(doc(regionalRecife(), 'pedidos', `c2027_${OUTRA}`)));
  });

  it('regional NÃO lê pedido de outra regional', async () => {
    await assertFails(getDoc(doc(regionalCuritiba(), 'pedidos', `c2027_${BOA_VIAGEM}`)));
  });
});

describe('o pedido não se escreve pelo cliente', () => {
  it('gestor não muda o estado do próprio pedido direto no banco', async () => {
    await assertFails(
      updateDoc(doc(gestorBoaViagem(), 'pedidos', `c2027_${BOA_VIAGEM}`), { estado: 'aprovado' }),
    );
  });

  it('gestor não forja os totais', async () => {
    await assertFails(
      updateDoc(doc(gestorBoaViagem(), 'pedidos', `c2027_${BOA_VIAGEM}`), {
        'totais.total': 1,
      }),
    );
  });

  it('nem o admin escreve em pedido', async () => {
    await assertFails(
      updateDoc(doc(administrador(), 'pedidos', `c2027_${BOA_VIAGEM}`), { estado: 'aprovado' }),
    );
  });

  it('a trilha de eventos não aceita escrita do cliente', async () => {
    await assertFails(
      setDoc(doc(gestorBoaViagem(), 'pedidos', `c2027_${BOA_VIAGEM}`, 'eventos', 'e1'), {
        tipo: 'aprovado',
      }),
    );
  });
});

describe('abrir o próprio rascunho', () => {
  const rascunhoVazio = (unidadeId: string, regionalId: string) => ({
    cicloId: 'c2028',
    unidadeId,
    regionalId,
    estado: 'rascunho',
    versao: 1,
    totais: { obrigatorio: 0, opcional: 0, total: 0 },
  });

  it('gestor abre o rascunho da própria unidade', async () => {
    await assertSucceeds(
      setDoc(
        doc(gestorBoaViagem(), 'pedidos', `c2028_${BOA_VIAGEM}`),
        rascunhoVazio(BOA_VIAGEM, RECIFE),
      ),
    );
  });

  it('NÃO abre rascunho em nome de outra unidade', async () => {
    await assertFails(
      setDoc(doc(gestorBoaViagem(), 'pedidos', `c2028_${OUTRA}`), rascunhoVazio(OUTRA, RECIFE)),
    );
  });

  it('NÃO abre um pedido já com dinheiro dentro', async () => {
    await assertFails(
      setDoc(doc(gestorBoaViagem(), 'pedidos', `c2028_${BOA_VIAGEM}`), {
        ...rascunhoVazio(BOA_VIAGEM, RECIFE),
        totais: { obrigatorio: 0, opcional: 0, total: 16_250_000 },
      }),
    );
  });

  it('NÃO abre um pedido já enviado ou aprovado', async () => {
    await assertFails(
      setDoc(doc(gestorBoaViagem(), 'pedidos', `c2028_${BOA_VIAGEM}`), {
        ...rascunhoVazio(BOA_VIAGEM, RECIFE),
        estado: 'aprovado',
      }),
    );
  });

  it('NÃO usa o id de um ciclo para gravar dados de outro', async () => {
    await assertFails(
      setDoc(doc(gestorBoaViagem(), 'pedidos', `c2029_${BOA_VIAGEM}`), {
        ...rascunhoVazio(BOA_VIAGEM, RECIFE),
        cicloId: 'c2028',
      }),
    );
  });
});

describe('itens do rascunho', () => {
  it('gestor monta itens enquanto o pedido é rascunho', async () => {
    await assertSucceeds(
      setDoc(doc(gestorBoaViagem(), 'pedidos', `c2027_${BOA_VIAGEM}`, 'itens', 'p1'), {
        produtoId: 'p1',
        anosSelecionados: ['EF1'],
        origem: 'escolha',
      }),
    );
  });

  it('gestor NÃO mexe nos itens depois de enviado', async () => {
    await assertFails(
      setDoc(doc(gestorOutraUnidade(), 'pedidos', `c2027_${OUTRA}`, 'itens', 'p1'), {
        produtoId: 'p1',
        anosSelecionados: ['EF1'],
        origem: 'escolha',
      }),
    );
  });

  it('gestor NÃO mexe nos itens de outra unidade', async () => {
    await assertFails(
      setDoc(doc(gestorBoaViagem(), 'pedidos', `c2027_${OUTRA}`, 'itens', 'p1'), {
        produtoId: 'p1',
      }),
    );
  });
});

describe('previsão de alunos', () => {
  it('gestor grava a previsão da própria unidade', async () => {
    await assertSucceeds(
      setDoc(doc(gestorBoaViagem(), 'matriculas', `c2027_${BOA_VIAGEM}`), {
        cicloId: 'c2027',
        unidadeId: BOA_VIAGEM,
        regionalId: RECIFE,
        porAno: { EF1: 88 },
      }),
    );
  });

  it('gestor NÃO grava previsão em nome de outra unidade', async () => {
    await assertFails(
      setDoc(doc(gestorBoaViagem(), 'matriculas', `c2027_${OUTRA}`), {
        cicloId: 'c2027',
        unidadeId: OUTRA,
        regionalId: RECIFE,
        porAno: { EF1: 88 },
      }),
    );
  });

  it('regional não grava previsão de ninguém', async () => {
    await assertFails(
      setDoc(doc(regionalRecife(), 'matriculas', `c2027_${BOA_VIAGEM}`), {
        cicloId: 'c2027',
        unidadeId: BOA_VIAGEM,
        regionalId: RECIFE,
        porAno: { EF1: 999 },
      }),
    );
  });
});

describe('segredos e privilégios', () => {
  it('ninguém lê convites — nem o admin', async () => {
    await assertFails(getDoc(doc(administrador(), 'convites', 'cv1')));
    await assertFails(getDoc(doc(gestorBoaViagem(), 'convites', 'cv1')));
  });

  it('ninguém escreve o próprio papel', async () => {
    await assertFails(
      updateDoc(doc(gestorBoaViagem(), 'usuarios', 'u_gestor'), { papel: 'admin' }),
    );
    await assertFails(updateDoc(doc(administrador(), 'usuarios', 'u_gestor'), { papel: 'admin' }));
  });

  it('cada um lê o próprio cadastro', async () => {
    await assertSucceeds(getDoc(doc(gestorBoaViagem(), 'usuarios', 'u_gestor')));
  });

  it('gestor não escreve no catálogo', async () => {
    await assertFails(
      setDoc(doc(gestorBoaViagem(), 'produtos', 'p9'), { nome: 'Grátis', cicloId: 'c2027' }),
    );
  });

  it('admin escreve no catálogo', async () => {
    await assertSucceeds(
      setDoc(doc(administrador(), 'produtos', 'p9'), { nome: 'Robótica', cicloId: 'c2027' }),
    );
  });
});
