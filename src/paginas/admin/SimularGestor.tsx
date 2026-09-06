import { useEffect, useMemo, useState } from 'react';
import { Botao, Campo, Cartao, EsqueletoLinhas, Selecao } from '@/componentes/ui';
import { useSessao } from '@/lib/auth';
import type { Sessao } from '@/lib/auth';
import { listarRegionais, listarUnidades } from '@/lib/dados';
import type { Regional, Unidade } from '@dominio/tipos';
import { FluxoPedido } from '@/paginas/gestor/FluxoPedido';

/**
 * O admin escolhe regional e unidade e cai exatamente na mesma tela que o
 * gestor vê — previsão, escolha, mapa — já com a habilitação daquela
 * regional aplicada. Existe para conferir o catálogo pelo ponto de vista de
 * quem preenche, sem esperar alguém de verdade reclamar.
 *
 * Simulação, não acesso: o `FluxoPedido` entra em modo `simulado`, cujo
 * escritor nunca chega ao Firestore nem chama Cloud Function — sair daqui
 * derruba tudo o que foi "preenchido".
 */
export function SimularGestor() {
  const sessaoAdmin = useSessao();
  const [regionais, setRegionais] = useState<Regional[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [regionalId, setRegionalId] = useState('');
  const [unidadeId, setUnidadeId] = useState('');
  const [simulando, setSimulando] = useState(false);

  useEffect(() => {
    void Promise.all([listarRegionais(), listarUnidades()])
      .then(([rs, us]) => {
        setRegionais(rs);
        setUnidades(us);
      })
      .catch(() => setErro('Não foi possível carregar regionais e unidades. Recarregue a página.'))
      .finally(() => setCarregando(false));
  }, []);

  const unidadesDaRegional = useMemo(
    () => unidades.filter((u) => u.regionalId === regionalId),
    [unidades, regionalId],
  );

  // Trocar de regional com uma unidade de outra regional já escolhida não
  // deve deixar a seleção inconsistente.
  useEffect(() => {
    if (unidadeId && !unidadesDaRegional.some((u) => u.id === unidadeId)) setUnidadeId('');
  }, [unidadesDaRegional, unidadeId]);

  const regional = regionais.find((r) => r.id === regionalId);
  const unidade = unidades.find((u) => u.id === unidadeId);

  const sessaoSimulada: Sessao | null =
    regional && unidade
      ? {
          uid: sessaoAdmin.uid,
          nome: sessaoAdmin.nome,
          email: sessaoAdmin.email,
          papel: 'gestor_unidade',
          unidadeId: unidade.id,
          regionalId: regional.id,
        }
      : null;

  if (simulando && sessaoSimulada && unidade && regional) {
    return (
      <div className="flex flex-col gap-4">
        <Cartao className="flex-row flex-wrap items-center gap-3 border-l-3 border-l-amber-400 bg-amber-50 p-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-amber-900">
              Simulando como gestor de {unidade.nome}
            </span>
            <span className="text-xs text-amber-800">
              {regional.nome} · nada do que você fizer aqui é salvo — é só para ver a tela como o
              gestor vê.
            </span>
          </div>
          <div className="flex-1" />
          <Botao variante="secundario" tamanho="sm" onClick={() => setSimulando(false)}>
            Encerrar simulação
          </Botao>
        </Cartao>
        <FluxoPedido sessaoForcada={sessaoSimulada} simulado />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-brand">Simular visão do gestor</h1>
        <p className="max-w-prose text-sm text-gray-500">
          Escolha uma regional e uma unidade para caminhar pela mesma tela que o gestor vê —
          previsão de alunos, escolha das soluções e mapa —, já com a habilitação daquela regional
          aplicada. Nada aqui é gravado: é uma simulação, não um pedido de verdade.
        </p>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {carregando ? (
        <EsqueletoLinhas linhas={3} />
      ) : (
        <Cartao className="max-w-lg gap-4 p-5">
          <Campo rotulo="Regional" obrigatorio>
            <Selecao value={regionalId} onChange={(e) => setRegionalId(e.target.value)}>
              <option value="">Selecione…</option>
              {regionais.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Unidade"
            obrigatorio
            dica={
              regionalId && unidadesDaRegional.length === 0
                ? 'Nenhuma unidade cadastrada nesta regional.'
                : undefined
            }
          >
            <Selecao
              value={unidadeId}
              onChange={(e) => setUnidadeId(e.target.value)}
              disabled={!regionalId}
            >
              <option value="">Selecione…</option>
              {unidadesDaRegional.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Botao disabled={!sessaoSimulada} onClick={() => setSimulando(true)}>
            Iniciar simulação
          </Botao>
        </Cartao>
      )}
    </div>
  );
}
