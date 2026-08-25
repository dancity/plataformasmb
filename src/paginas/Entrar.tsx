import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Botao, Campo, Cartao, Entrada, SeletorTema } from '@/componentes/ui';
import { useAuth } from '@/lib/auth';

/**
 * Portas de entrada, em ordem de intenção:
 *
 *   Microsoft  — o caminho do produto: a mesma conta do Teams, sem senha nova.
 *   Link       — chega pronto, amarrado a uma unidade; não há tela para escolher
 *                unidade, que é justamente a escolha a impedir.
 *   E-mail     — para quem a administração cadastrou. Sem autocadastro: a senha
 *                é definida pela própria pessoa, pelo link de redefinição.
 *   Google     — acesso interno provisório, sai quando o SSO subir.
 *
 * Nenhuma delas concede nada por si: sem papel no token, todas as regras do
 * banco negam e a pessoa para na tela "sem vínculo".
 */
type Ocupado = 'ms' | 'google' | 'email' | 'reset' | 'convite' | null;

export function Entrar() {
  const {
    entrarComMicrosoft,
    entrarComGoogle,
    entrarComEmailSenha,
    pedirRedefinicaoSenha,
    entrarComConvite,
  } = useAuth();

  const [params] = useSearchParams();
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const tokenConvite = params.get('convite');

  useEffect(() => {
    if (!tokenConvite) return;
    setOcupado('convite');
    setErro(null);
    entrarComConvite(tokenConvite)
      .catch(() => {
        // Resposta única: não dizemos se o token não existe, expirou ou já
        // foi usado — cada distinção dessas é pista para quem testa links
        // no escuro.
        setErro(
          'Este link de acesso não está mais válido. Peça um novo para a sua regional ou para a administração.',
        );
      })
      .finally(() => setOcupado(null));
  }, [tokenConvite, entrarComConvite]);

  function traduzirErro(e: unknown, provedor: string): string {
    const codigo = (e as { code?: string }).code ?? '';
    switch (codigo) {
      case 'auth/popup-closed-by-user':
        return 'A janela de login foi fechada antes de concluir. Tente de novo.';
      case 'auth/popup-blocked':
        return 'O navegador bloqueou a janela de login. Libere os pop-ups para este site e tente de novo.';
      case 'auth/operation-not-allowed':
      case 'auth/configuration-not-found':
        return `A entrada com ${provedor} ainda não está habilitada neste projeto.`;
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        // Resposta única para os três: dizer "este e-mail não existe"
        // entrega a lista de quem tem conta a quem estiver tentando.
        return 'E-mail ou senha não conferem.';
      case 'auth/invalid-email':
        return 'Esse e-mail não parece válido.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas seguidas. Espere alguns minutos antes de tentar de novo.';
      default:
        return `Não foi possível entrar com ${provedor}. Se o problema continuar, fale com a administração.`;
    }
  }

  async function tentar(qual: Ocupado, trabalho: () => Promise<void>, provedor: string) {
    setOcupado(qual);
    setErro(null);
    setAviso(null);
    try {
      await trabalho();
    } catch (e) {
      setErro(traduzirErro(e, provedor));
    } finally {
      setOcupado(null);
    }
  }

  async function redefinirSenha() {
    if (!email.trim()) {
      setErro('Escreva o seu e-mail acima para receber o link de redefinição.');
      return;
    }
    setOcupado('reset');
    setErro(null);
    try {
      await pedirRedefinicaoSenha(email);
    } catch {
      /* silencia de propósito — ver aviso abaixo */
    } finally {
      setOcupado(null);
      // Mensagem idêntica com e sem conta cadastrada: confirmar a existência
      // do e-mail transformaria esta tela em consulta de quem tem acesso.
      setAviso(
        'Se houver uma conta com esse e-mail, o link de redefinição chega em instantes. Verifique também o lixo eletrônico.',
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <SeletorTema />
      </div>

      <div className="flex flex-1 items-start justify-center px-6 pb-16">
        <div className="flex w-full max-w-md flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-brand">Levantamento de Interesse</h1>
            <p className="text-sm text-gray-500">
              Contratação de soluções educacionais para 2027. Entre para montar o pedido da sua
              unidade.
            </p>
          </div>

          <Cartao className="gap-5 p-6">
            <Botao
              onClick={() => void tentar('ms', entrarComMicrosoft, 'a conta Microsoft')}
              carregando={ocupado === 'ms'}
            >
              Entrar com a conta Microsoft
            </Botao>

            <p className="text-xs text-gray-500">
              Use a mesma conta do Teams. Se a sua unidade recebeu um link de acesso, basta abrir o
              link — não é preciso fazer nada aqui.
            </p>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-gray-200" />
              <span className="text-[11px] tracking-wide text-gray-400 uppercase">
                ou com e-mail
              </span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void tentar('email', () => entrarComEmailSenha(email, senha), 'e-mail e senha');
              }}
            >
              <Campo rotulo="E-mail">
                <Entrada
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  placeholder="nome@marista.org.br"
                  required
                />
              </Campo>

              <Campo rotulo="Senha">
                <Entrada
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Campo>

              <div className="flex flex-wrap items-center gap-3">
                <Botao type="submit" carregando={ocupado === 'email'}>
                  Entrar
                </Botao>
                <Botao
                  type="button"
                  variante="fantasma"
                  tamanho="sm"
                  carregando={ocupado === 'reset'}
                  onClick={() => void redefinirSenha()}
                >
                  Esqueci minha senha
                </Botao>
              </div>
            </form>

            {/* Acesso interno, provisório — sai quando o SSO Microsoft subir. */}
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-gray-200" />
              <span className="text-[11px] tracking-wide text-gray-400 uppercase">
                acesso interno
              </span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <Botao
              variante="secundario"
              onClick={() => void tentar('google', entrarComGoogle, 'a conta Google')}
              carregando={ocupado === 'google'}
            >
              Entrar com a conta Google
            </Botao>

            {ocupado === 'convite' && (
              <p className="text-sm text-gray-500">Validando o link de acesso…</p>
            )}
            {erro && (
              <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
                {erro}
              </p>
            )}
            {aviso && (
              <p className="rounded-lg bg-blue-100 px-3 py-2 text-sm text-blue-800">{aviso}</p>
            )}
          </Cartao>

          <p className="text-xs text-gray-500">
            Precisa de acesso? Fale com a gestão da sua regional — é ela que cadastra o gestor
            responsável por cada unidade.
          </p>
        </div>
      </div>
    </div>
  );
}
