import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import type { Papel } from '@dominio/tipos';
import { Botao, SeletorTema } from './ui';

const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administração',
  gestor_regional: 'Gestão regional',
  gestor_unidade: 'Gestão da unidade',
  leitura: 'Consulta',
};

export function Layout({ children }: { children: ReactNode }) {
  const { estado, sair } = useAuth();
  const sessao = estado.situacao === 'ativa' ? estado.sessao : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-brand">Levantamento de Interesse</span>
            <span className="text-xs text-gray-500">Contratação 2027</span>
          </div>

          <div className="flex-1" />

          {sessao && (
            <div className="flex flex-col text-right">
              <span className="text-sm font-medium text-gray-700">{sessao.nome}</span>
              <span className="text-xs text-gray-500">{ROTULO_PAPEL[sessao.papel]}</span>
            </div>
          )}
          <SeletorTema />
          {sessao && (
            <Botao variante="secundario" tamanho="sm" onClick={() => void sair()}>
              Sair
            </Botao>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      <footer className="border-t border-gray-200 px-6 py-4">
        <p className="mx-auto max-w-6xl text-xs text-gray-500">
          Os valores exibidos são estimativas calculadas sobre a previsão de alunos informada pela
          unidade.
        </p>
      </footer>
    </div>
  );
}
