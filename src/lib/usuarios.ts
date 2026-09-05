import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { Papel, Usuario } from '@dominio/tipos';
import { db, functions } from './firebase';

/**
 * Cadastro de usuários. A leitura é direta no Firestore — as regras liberam
 * para o admin (e para a regional, escopado). A escrita nunca é: papel e
 * vínculo só mudam por Cloud Function, que também grava o custom claim.
 * `usuarios` no cliente sem isso seria só decoração, não controle.
 */

export async function listarUsuarios(): Promise<Usuario[]> {
  const snap = await getDocs(query(collection(db, 'usuarios'), orderBy('email')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Usuario);
}

export interface DadosPapel {
  email: string;
  nome?: string;
  papel: Papel;
  unidadeId?: string;
  regionalId?: string;
}

/**
 * Cria a conta (se ainda não existir) e define papel e vínculo — unidade,
 * regional, ou nenhum dos dois, para o nível nacional. Convocar de novo com
 * papel diferente reatribui em vez de duplicar: e-mail é a chave.
 */
export async function definirPapel(dados: DadosPapel): Promise<{ uid: string; papel: Papel }> {
  const chamar = httpsCallable<DadosPapel, { uid: string; papel: Papel }>(
    functions,
    'definirPapel',
  );
  const { data } = await chamar(dados);
  return data;
}

/**
 * Corta o acesso sem apagar a trilha: limpa os claims e marca o cadastro
 * como inativo. Quem foi desativado não desaparece da lista.
 */
export async function desativarUsuario(uid: string): Promise<void> {
  const chamar = httpsCallable<{ uid: string }, { ok: true }>(functions, 'desativarUsuario');
  await chamar({ uid });
}
