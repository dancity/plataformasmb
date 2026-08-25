import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Papel } from '../../dominio/tipos';

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
export const admin = getAuth();

/** Mesma região do Firestore: evita ida e volta ao hemisfério norte. */
export const REGIAO = 'southamerica-east1';

export const OPCOES_PADRAO = {
  region: REGIAO,
  maxInstances: 10,
  // Enquanto o App Check não estiver configurado no console, deixar em false.
  // Ligar depois é uma linha — e barra chamada feita fora do app.
  enforceAppCheck: false,
} as const;

export interface Chamador {
  uid: string;
  papel: Papel;
  nome: string;
  email: string;
  unidadeId?: string;
  regionalId?: string;
}

const PAPEIS: readonly Papel[] = ['admin', 'gestor_regional', 'gestor_unidade', 'leitura'];

/**
 * Toda function protegida começa por aqui. Papel e vínculo saem dos custom
 * claims do token verificado pelo runtime — nunca de argumento da chamada,
 * que é escrito pelo cliente e vale tanto quanto um palpite.
 */
export function exigirPapel(req: CallableRequest, permitidos: readonly Papel[]): Chamador {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'É preciso estar autenticado.');
  }
  const claims = req.auth.token as Record<string, unknown>;
  const papel = claims.papel;

  if (typeof papel !== 'string' || !PAPEIS.includes(papel as Papel)) {
    throw new HttpsError('permission-denied', 'Sua conta ainda não está vinculada a uma unidade.');
  }
  if (!permitidos.includes(papel as Papel)) {
    throw new HttpsError('permission-denied', 'Seu perfil não tem acesso a esta ação.');
  }

  return {
    uid: req.auth.uid,
    papel: papel as Papel,
    nome: (claims.name as string) ?? (claims.nome as string) ?? '',
    email: (claims.email as string) ?? '',
    unidadeId: (claims.unidadeId as string) || undefined,
    regionalId: (claims.regionalId as string) || undefined,
  };
}

export function agora(): string {
  return new Date().toISOString();
}

export function exigirTexto(valor: unknown, campo: string, maximo = 500): string {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new HttpsError('invalid-argument', `Campo obrigatório: ${campo}.`);
  }
  if (valor.length > maximo) {
    throw new HttpsError('invalid-argument', `${campo} passa de ${maximo} caracteres.`);
  }
  return valor.trim();
}

/**
 * Limitador de tentativas simples, em Firestore. Existe para o resgate de
 * convite: sem ele, dá para varrer tokens no escuro à vontade.
 */
export async function limitarTentativas(
  chave: string,
  maximo: number,
  janelaSegundos: number,
): Promise<void> {
  const ref = db.collection('limites').doc(chave);
  const limite = Date.now() - janelaSegundos * 1000;

  const excedeu = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const dados = doc.data() as { inicio?: number; contagem?: number } | undefined;

    if (!dados || (dados.inicio ?? 0) < limite) {
      tx.set(ref, { inicio: Date.now(), contagem: 1 });
      return false;
    }
    const contagem = (dados.contagem ?? 0) + 1;
    tx.set(ref, { inicio: dados.inicio, contagem }, { merge: true });
    return contagem > maximo;
  });

  if (excedeu) {
    throw new HttpsError('resource-exhausted', 'Muitas tentativas. Tente de novo em alguns minutos.');
  }
}
