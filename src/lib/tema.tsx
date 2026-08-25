import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Tema em três estados. A preferência mora no localStorage, não no banco:
 * é escolha do aparelho, não da pessoa — desktop claro no trabalho e
 * notebook escuro em casa não devem se sobrescrever.
 */
export type Tema = 'claro' | 'escuro' | 'sistema';

const CHAVE = 'tema';

interface ContextoTema {
  tema: Tema;
  escuro: boolean;
  definirTema: (t: Tema) => void;
}

const Contexto = createContext<ContextoTema | null>(null);

function lerPreferencia(): Tema {
  try {
    const guardado = localStorage.getItem(CHAVE);
    if (guardado === 'claro' || guardado === 'escuro' || guardado === 'sistema') return guardado;
  } catch {
    /* sem storage: segue no padrão */
  }
  return 'sistema';
}

function sistemaPrefereEscuro(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function aplicar(escuro: boolean) {
  const raiz = document.documentElement;
  raiz.classList.toggle('dark', escuro);
  // Faz o navegador acertar sozinho o que não estilizamos: barras de
  // rolagem, seletores de data nativos e autofill.
  raiz.style.colorScheme = escuro ? 'dark' : 'light';
}

export function ProvedorTema({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(lerPreferencia);
  const [escuro, setEscuro] = useState<boolean>(
    () => tema === 'escuro' || (tema === 'sistema' && sistemaPrefereEscuro()),
  );

  useEffect(() => {
    const alvo = tema === 'escuro' || (tema === 'sistema' && sistemaPrefereEscuro());
    setEscuro(alvo);
    aplicar(alvo);
  }, [tema]);

  // No modo 'sistema', acompanha a troca do SO em tempo real.
  useEffect(() => {
    if (tema !== 'sistema') return;
    const consulta = window.matchMedia('(prefers-color-scheme: dark)');
    const aoMudar = (e: MediaQueryListEvent) => {
      setEscuro(e.matches);
      aplicar(e.matches);
    };
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, [tema]);

  const definirTema = useCallback((t: Tema) => {
    setTema(t);
    try {
      localStorage.setItem(CHAVE, t);
    } catch {
      /* sem storage: vale só para esta sessão */
    }
  }, []);

  const valor = useMemo(() => ({ tema, escuro, definirTema }), [tema, escuro, definirTema]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTema(): ContextoTema {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useTema precisa estar dentro de <ProvedorTema>');
  return ctx;
}
