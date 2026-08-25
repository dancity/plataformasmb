import { Botao, EstadoVazio } from '@/componentes/ui';
import { useAuth } from '@/lib/auth';

/**
 * Autenticou, mas ninguém o cadastrou como gestor de nenhuma unidade.
 * Não é erro do usuário nem falha do sistema — é cadastro faltando, e a
 * tela precisa dizer isso e para quem recorrer.
 */
export function SemVinculo({ email }: { email: string }) {
  const { sair } = useAuth();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
      <EstadoVazio
        icone={
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
            <path
              d="M12 8v5m0 3.5h.01M12 3l9 16H3l9-16Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
        titulo="Sua conta ainda não está vinculada a uma unidade"
        descricao={`Entramos com ${email}, mas esse e-mail não consta como gestor responsável de nenhuma unidade neste ciclo. A gestão da sua regional faz esse cadastro — depois disso, basta entrar de novo.`}
        acao={
          <Botao variante="secundario" onClick={() => void sair()}>
            Sair e tentar outra conta
          </Botao>
        }
      />
    </div>
  );
}
