import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Esqueleto, EstadoVazio, Selo, juntar } from '@/componentes/ui';
import { useSessao } from '@/lib/auth';
import { carregarContexto } from '@/lib/pedido';
import type { ContextoPedido } from '@/lib/pedido';
import { EtapaPrevisao } from './EtapaPrevisao';
import { EtapaEscolha } from './EtapaEscolha';
import { EtapaMapa } from './EtapaMapa';

/**
 * O fluxo do gestor. A etapa vive na URL: sair no meio e voltar depois é o
 * comportamento normal aqui, não a exceção — ninguém decide o orçamento do
 * ano em uma sessão de dez minutos.
 */
export type Etapa = 'previsao' | 'escolha' | 'mapa';

const ETAPAS: { id: Etapa; rotulo: string; numero: number }[] = [
  { id: 'previsao', rotulo: 'Previsão de alunos', numero: 1 },
  { id: 'escolha', rotulo: 'Escolha das soluções', numero: 2 },
  { id: 'mapa', rotulo: 'Mapa e envio', numero: 3 },
];

function ehEtapa(v: string | null): v is Etapa {
  return v === 'previsao' || v === 'escolha' || v === 'mapa';
}

export function FluxoPedido() {
  const sessao = useSessao();
  const [params, setParams] = useSearchParams();
  const [ctx, setCtx] = useState<ContextoPedido | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const etapa: Etapa = ehEtapa(params.get('etapa')) ? (params.get('etapa') as Etapa) : 'previsao';

  const irPara = useCallback(
    (destino: Etapa) => {
      setParams({ etapa: destino });
      window.scrollTo({ top: 0 });
    },
    [setParams],
  );

  const recarregar = useCallback(async () => {
    setErro(null);
    try {
      setCtx(await carregarContexto(sessao));
    } catch (e) {
      setErro(
        (e as { code?: string }).code === 'permission-denied'
          ? 'Sua conta não tem acesso a esta unidade. Saia e entre de novo; se continuar, fale com a sua regional.'
          : 'Não foi possível carregar o levantamento. Verifique a conexão e recarregue.',
      );
    } finally {
      setCarregando(false);
    }
  }, [sessao]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (carregando) {
    return (
      <div className="flex flex-col gap-4">
        <Esqueleto className="h-7 w-72" />
        <Esqueleto className="h-4 w-96" />
        <Esqueleto className="h-64 w-full" />
      </div>
    );
  }

  if (erro) {
    return (
      <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
        {erro}
      </p>
    );
  }

  if (!ctx) {
    return (
      <EstadoVazio
        icone={<span aria-hidden="true">📋</span>}
        titulo="Nenhum ciclo aberto no momento"
        descricao="Quando a administração abrir o levantamento do próximo ano, ele aparece aqui e você recebe um aviso. Não há nada a fazer até lá."
      />
    );
  }

  const fechado = ctx.ciclo.estado !== 'aberto';
  const enviado = !!ctx.pedido && ctx.pedido.estado !== 'rascunho' && ctx.pedido.estado !== 'devolvido';
  const somenteLeitura = fechado || enviado;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-brand">{ctx.unidade.nome}</h1>
          {enviado && <Selo tom="concluido">pedido enviado</Selo>}
          {fechado && <Selo tom="neutro">ciclo encerrado</Selo>}
        </div>
        <p className="text-sm text-gray-500">
          {ctx.ciclo.nome} · prazo de envio até{' '}
          {new Date(ctx.ciclo.prazoGestor).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
          })}
        </p>
      </div>

      <ol className="flex flex-wrap gap-1" aria-label="Etapas">
        {ETAPAS.map((e) => {
          const atual = e.id === etapa;
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => irPara(e.id)}
                aria-current={atual ? 'step' : undefined}
                className={juntar(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  atual
                    ? 'bg-brand-medium text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
                )}
              >
                <span
                  className={juntar(
                    'flex h-5 w-5 items-center justify-center rounded-full text-xs',
                    atual ? 'bg-white/25' : 'bg-gray-200 text-gray-600',
                  )}
                >
                  {e.numero}
                </span>
                {e.rotulo}
              </button>
            </li>
          );
        })}
      </ol>

      {etapa === 'previsao' && (
        <EtapaPrevisao
          ctx={ctx}
          sessao={sessao}
          somenteLeitura={somenteLeitura}
          aoAvancar={() => irPara('escolha')}
          aoSalvar={recarregar}
        />
      )}
      {etapa === 'escolha' && (
        <EtapaEscolha
          ctx={ctx}
          sessao={sessao}
          somenteLeitura={somenteLeitura}
          aoVoltar={() => irPara('previsao')}
          aoAvancar={() => irPara('mapa')}
          aoSalvar={recarregar}
        />
      )}
      {etapa === 'mapa' && (
        <EtapaMapa
          ctx={ctx}
          sessao={sessao}
          somenteLeitura={somenteLeitura}
          aoVoltar={() => irPara('escolha')}
          aoSalvar={recarregar}
        />
      )}
    </div>
  );
}
