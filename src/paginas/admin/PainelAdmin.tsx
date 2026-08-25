import { useCallback, useEffect, useState } from 'react';
import { DialogoConfirmacao } from '@/componentes/Modal';
import { Botao, Cartao, Esqueleto, EstadoVazio, Selo } from '@/componentes/ui';
import type { TomStatus } from '@/componentes/ui';
import { criarCiclo, mudarEstadoCiclo, resumoDoCiclo, semearRegionais } from '@/lib/dados';
import type { ResumoCiclo } from '@/lib/dados';
import type { EstadoCiclo } from '@dominio/tipos';
import { useAdmin } from './LayoutAdmin';

const ANO_ALVO = 2027;

const SELO_CICLO: Record<EstadoCiclo, { tom: TomStatus; rotulo: string }> = {
  rascunho: { tom: 'neutro', rotulo: 'rascunho' },
  aberto: { tom: 'ok', rotulo: 'aberto' },
  encerrado: { tom: 'concluido', rotulo: 'encerrado' },
};

function data(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function Numero({ valor, rotulo, alerta }: { valor: number; rotulo: string; alerta?: string }) {
  return (
    <Cartao className="gap-1 p-5">
      <span className="text-2xl font-semibold text-brand tabular-nums">{valor}</span>
      <span className="text-sm text-gray-500">{rotulo}</span>
      {alerta && <span className="text-xs text-amber-800">{alerta}</span>}
    </Cartao>
  );
}

export function PainelAdmin() {
  const { ciclo, recarregarCiclo } = useAdmin();
  const [carregando, setCarregando] = useState(true);
  const [resumo, setResumo] = useState<ResumoCiclo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmandoAbertura, setConfirmandoAbertura] = useState(false);

  // Depende só do id: o objeto do ciclo muda de identidade a cada leitura do
  // Firestore, e recarregar em cima dele se realimentaria sem parar.
  const cicloId = ciclo?.id ?? null;

  const carregarResumo = useCallback(async () => {
    setErro(null);
    try {
      setResumo(cicloId ? await resumoDoCiclo(cicloId) : null);
    } catch (e) {
      setErro(
        (e as { code?: string }).code === 'permission-denied'
          ? 'Seu usuário não tem permissão de administração. Saia e entre de novo para o token pegar o papel novo.'
          : 'Não foi possível carregar o ciclo. Verifique a conexão e tente de novo.',
      );
    } finally {
      setCarregando(false);
    }
  }, [cicloId]);

  useEffect(() => {
    void carregarResumo();
  }, [carregarResumo]);

  async function acao(trabalho: () => Promise<string | null>) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const mensagem = await trabalho();
      if (mensagem) setAviso(mensagem);
      await recarregarCiclo();
      await carregarResumo();
    } catch (e) {
      setErro((e as Error).message ?? 'Não deu certo. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex flex-col gap-4">
        <Esqueleto className="h-7 w-56" />
        <Esqueleto className="h-4 w-96" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Esqueleto className="h-24" />
          <Esqueleto className="h-24" />
          <Esqueleto className="h-24" />
          <Esqueleto className="h-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-brand">Administração</h1>
        <p className="text-sm text-gray-500">
          Um ciclo por ano. Tudo — catálogo, previsão de alunos, pedidos — vive dentro dele.
        </p>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-lg bg-green-100 px-4 py-3 text-sm text-green-800">{aviso}</p>
      )}

      {!ciclo ? (
        <EstadoVazio
          icone={
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          titulo={`Nenhum ciclo criado ainda`}
          descricao={`O ciclo é o recipiente de tudo: soluções, preços, previsões e pedidos ficam carimbados com ele, e é por isso que o ano que vem não corrompe o histórico deste. Ele nasce em rascunho — nada fica visível para as unidades até você abrir.`}
          acao={
            <Botao
              carregando={ocupado}
              onClick={() =>
                void acao(async () => {
                  await criarCiclo(ANO_ALVO);
                  return `Ciclo ${ANO_ALVO} criado em rascunho.`;
                })
              }
            >
              Criar ciclo {ANO_ALVO}
            </Botao>
          }
        />
      ) : (
        <>
          <Cartao className="gap-4 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-brand">{ciclo.nome}</h2>
              <Selo tom={SELO_CICLO[ciclo.estado].tom}>{SELO_CICLO[ciclo.estado].rotulo}</Selo>
            </div>

            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col">
                <dt className="text-xs tracking-wide text-gray-500 uppercase">Aberto em</dt>
                <dd className="text-sm text-gray-700">{data(ciclo.aberturaEm)}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs tracking-wide text-gray-500 uppercase">
                  Prazo das unidades
                </dt>
                <dd className="text-sm text-gray-700">{data(ciclo.prazoGestor)}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs tracking-wide text-gray-500 uppercase">Prazo das regionais</dt>
                <dd className="text-sm text-gray-700">{data(ciclo.prazoRegional)}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
              {ciclo.estado === 'rascunho' && (
                <Botao
                  carregando={ocupado}
                  disabled={!resumo || resumo.solucoes === 0 || resumo.unidades === 0}
                  onClick={() => setConfirmandoAbertura(true)}
                >
                  Abrir para as unidades
                </Botao>
              )}
              {ciclo.estado === 'aberto' && (
                <Botao
                  variante="secundario"
                  carregando={ocupado}
                  onClick={() =>
                    void acao(async () => {
                      await mudarEstadoCiclo(ciclo.id, 'encerrado');
                      return 'Ciclo encerrado. As unidades não conseguem mais enviar.';
                    })
                  }
                >
                  Encerrar ciclo
                </Botao>
              )}
              {ciclo.estado === 'rascunho' && resumo?.solucoes === 0 && (
                <p className="self-center text-xs text-gray-500">
                  Cadastre ao menos uma solução e uma unidade antes de abrir.
                </p>
              )}
            </div>
          </Cartao>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Numero
              valor={resumo?.regionais ?? 0}
              rotulo="regionais"
              alerta={resumo?.regionais === 0 ? 'nenhuma cadastrada' : undefined}
            />
            <Numero
              valor={resumo?.unidades ?? 0}
              rotulo="unidades"
              alerta={resumo?.unidades === 0 ? 'nenhuma cadastrada' : undefined}
            />
            <Numero valor={resumo?.solucoes ?? 0} rotulo="soluções no catálogo" />
            <Numero valor={resumo?.pedidosEnviados ?? 0} rotulo="pedidos iniciados" />
          </div>

          {resumo?.regionais === 0 && (
            <Cartao className="gap-3 p-6">
              <h3 className="text-base font-semibold text-brand">Comece pelas regionais</h3>
              <p className="text-sm text-gray-500">
                São seis e não mudam: Recife, Brasília, Belo Horizonte, Porto Alegre, Curitiba e São
                Paulo. Elas precisam existir antes das unidades, porque cada unidade pertence a uma.
              </p>
              <div>
                <Botao
                  carregando={ocupado}
                  onClick={() =>
                    void acao(async () => {
                      const criadas = await semearRegionais();
                      return criadas > 0
                        ? `${criadas} regionais cadastradas.`
                        : 'As regionais já estavam cadastradas.';
                    })
                  }
                >
                  Cadastrar as 6 regionais
                </Botao>
              </div>
            </Cartao>
          )}
        </>
      )}

      <DialogoConfirmacao
        aberto={confirmandoAbertura}
        nivel="medio"
        titulo="Abrir o ciclo para as unidades"
        descricao="A partir daqui os gestores passam a ver o catálogo e podem montar o pedido."
        detalhe={
          resumo && (
            <ul className="flex flex-col gap-1">
              <li>{resumo.unidades} unidades passam a ter acesso</li>
              <li>{resumo.solucoes} soluções ficam visíveis com seus preços</li>
              <li>
                Prazo de envio: {ciclo ? data(ciclo.prazoGestor) : '—'} (dá para prorrogar depois)
              </li>
            </ul>
          )
        }
        textoConfirmar="Abrir ciclo"
        carregando={ocupado}
        aoCancelar={() => setConfirmandoAbertura(false)}
        aoConfirmar={() => {
          setConfirmandoAbertura(false);
          void acao(async () => {
            await mudarEstadoCiclo(ciclo!.id, 'aberto');
            return 'Ciclo aberto. As unidades já podem montar o pedido.';
          });
        }}
      />
    </div>
  );
}
