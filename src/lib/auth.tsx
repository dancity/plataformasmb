import {
  GoogleAuthProvider,
  OAuthProvider,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Papel } from '@dominio/tipos';
import { auth, functions } from './firebase';

/**
 * Sessão do usuário. Papel e vínculo vêm dos custom claims do ID token —
 * nunca de documento gravável pelo cliente, e nunca de estado do React.
 *
 * A interface usa isso para esconder o que não interessa; quem impede de
 * verdade são as regras do Firestore e as Cloud Functions. As duas
 * camadas existem porque esconder não é proteger.
 */
export interface Sessao {
  uid: string;
  nome: string;
  email: string;
  papel: Papel;
  unidadeId?: string;
  regionalId?: string;
}

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'anonimo' }
  | { situacao: 'sem_vinculo'; email: string } // autenticou, mas ninguém o cadastrou
  | { situacao: 'ativa'; sessao: Sessao };

interface ContextoAuth {
  estado: Estado;
  entrarComMicrosoft: () => Promise<void>;
  entrarComGoogle: () => Promise<void>;
  entrarComEmailSenha: (email: string, senha: string) => Promise<void>;
  pedirRedefinicaoSenha: (email: string) => Promise<void>;
  entrarComConvite: (token: string) => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<ContextoAuth | null>(null);

const PAPEIS: readonly Papel[] = ['admin', 'gestor_regional', 'gestor_unidade', 'leitura'];

function ehPapel(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor);
}

async function montarEstado(usuario: User | null): Promise<Estado> {
  if (!usuario) return { situacao: 'anonimo' };

  // forceRefresh: logo após resgatar um convite os claims acabaram de ser
  // gravados, e o token em cache ainda não os tem.
  const token = await usuario.getIdTokenResult(true);
  const papel = token.claims.papel;

  if (!ehPapel(papel)) {
    return { situacao: 'sem_vinculo', email: usuario.email ?? '' };
  }

  return {
    situacao: 'ativa',
    sessao: {
      uid: usuario.uid,
      nome: usuario.displayName ?? (token.claims.nome as string) ?? usuario.email ?? 'Sem nome',
      email: usuario.email ?? (token.claims.email as string) ?? '',
      papel,
      unidadeId: (token.claims.unidadeId as string) || undefined,
      regionalId: (token.claims.regionalId as string) || undefined,
    },
  };
}

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });

  useEffect(() => {
    return onIdTokenChanged(auth, (usuario) => {
      montarEstado(usuario)
        .then(setEstado)
        .catch(() => setEstado({ situacao: 'anonimo' }));
    });
  }, []);

  const entrarComMicrosoft = useCallback(async () => {
    const provedor = new OAuthProvider('microsoft.com');
    // Restringe ao tenant da organização: conta pessoal Microsoft não entra.
    provedor.setCustomParameters({
      prompt: 'select_account',
      tenant: import.meta.env.VITE_MS_TENANT_ID ?? 'organizations',
    });
    await signInWithPopup(auth, provedor);
  }, []);

  /**
   * Acesso interno, provisório: existe porque o registro no Entra ID ainda
   * está com a TI e alguém precisa administrar o ciclo antes disso.
   *
   * Autenticar por aqui não dá acesso a nada: sem o claim de papel, todas as
   * regras do Firestore negam, e a pessoa cai na tela "sem vínculo". Quem
   * concede papel é o script `functions/scripts/papel.mjs` (hoje) ou a
   * function `definirPapel` (quando o Blaze estiver ligado).
   *
   * Remover quando o SSO Microsoft entrar no ar.
   */
  const entrarComGoogle = useCallback(async () => {
    const provedor = new GoogleAuthProvider();
    provedor.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provedor);
  }, []);

  /**
   * E-mail e senha. Não existe autocadastro: a conta é criada pela
   * administração, e a pessoa define a própria senha pelo link de
   * redefinição — assim ninguém precisa transmitir senha para ninguém.
   */
  const entrarComEmailSenha = useCallback(async (email: string, senha: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), senha);
  }, []);

  const pedirRedefinicaoSenha = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const entrarComConvite = useCallback(async (token: string) => {
    // O token do link nunca vira credencial sozinho: a function valida o
    // hash, o prazo, os usos e o escopo, e devolve um custom token já
    // amarrado à unidade certa.
    const resgatar = httpsCallable<{ token: string }, { customToken: string }>(
      functions,
      'resgatarConvite',
    );
    const { data } = await resgatar({ token });
    await signInWithCustomToken(auth, data.customToken);
  }, []);

  const sair = useCallback(async () => {
    await signOut(auth);
  }, []);

  const valor = useMemo(
    () => ({
      estado,
      entrarComMicrosoft,
      entrarComGoogle,
      entrarComEmailSenha,
      pedirRedefinicaoSenha,
      entrarComConvite,
      sair,
    }),
    [
      estado,
      entrarComMicrosoft,
      entrarComGoogle,
      entrarComEmailSenha,
      pedirRedefinicaoSenha,
      entrarComConvite,
      sair,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): ContextoAuth {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <ProvedorAuth>');
  return ctx;
}

/** Atalho para telas que só existem com sessão ativa. */
export function useSessao(): Sessao {
  const { estado } = useAuth();
  if (estado.situacao !== 'ativa') {
    throw new Error('useSessao chamado fora de uma rota protegida');
  }
  return estado.sessao;
}
