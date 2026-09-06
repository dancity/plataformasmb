import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DialogoConfirmacao } from '@/componentes/Modal';
import { Botao, Cartao, EsqueletoLinhas, EstadoVazio, Selo } from '@/componentes/ui';
import { excluirModelo, listarModelos, listarProdutos } from '@/lib/dados';
import type { Modelo, Produto } from '@dominio/tipos';
import { useAdmin } from './LayoutAdmin';

const SELO_VISIBILIDADE = {
  rascunho: { tom: 'neutro', rotulo: 'rascunho' },
  publicado: { tom: 'ok', rotulo: 'publicado' },
  suspenso: { tom: 'atencao', rotulo: 'suspenso' },
} as const;

/**
 * Modelos são pacotes fechados de soluções — pensados pra avaliação em
 * geral, que quase sempre vem no mesmo combo. O gestor escolhe um modelo na
 * etapa de escolha e todas as soluções da lista entram marcadas de uma vez;
 * daqui em diante ele revisa e ajusta como quiser, solução por solução.
 */
export function Modelos() {
  const { ciclo } = useAdmin();
  const navegar = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [excluindo, setExcluindo] = useState<Modelo | null>(null);
  const [apagando, setApagando] = useState(false);

  const carregar = useCallback(async () => {
    if (!ciclo) {
      setCarregando(false);
      return;
    }
    setErro(null);
    try {
      const [ms, ps] = await Promise.all([listarModelos(ciclo.id), listarProdutos(ciclo.id)]);
      setModelos(ms);
      setProdutos(ps);
    } catch {
      setErro('Não foi possível carregar os modelos. Recarregue a página.');
    } finally {
      setCarregando(false);
    }
  }, [ciclo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!ciclo) {
    return (
      <EstadoVazio
        icone={<span aria-hidden="true">⌛</span>}
        titulo="Crie o ciclo antes dos modelos"
        descricao="Modelo agrupa soluções de um ciclo específico. Volte à aba Ciclo e crie o de 2027."
      />
    );
  }

  if (carregando) return <EsqueletoLinhas linhas={4} />;

  const nomeProduto = (id: string) => produtos.find((p) => p.id === id)?.nome ?? '(solução removida)';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-brand">Modelos do ciclo {ciclo.anoAlvo}</h1>
          <p className="max-w-prose text-sm text-gray-500">
            Um pacote fechado de soluções que o gestor aplica de uma vez — útil pra avaliação em
            geral, que costuma vir sempre no mesmo combo. Aplicar um modelo marca cada solução da
            lista em todos os anos habilitados; o gestor continua livre pra revisar depois.
          </p>
        </div>
        <Botao
          onClick={() => navegar('/admin/modelos/novo')}
          disabled={produtos.length === 0}
        >
          Novo modelo
        </Botao>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {produtos.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">📦</span>}
          titulo="Cadastre soluções primeiro"
          descricao="Um modelo é uma lista de soluções já existentes — cadastre o catálogo antes de montar o primeiro pacote."
          acao={
            <Botao variante="secundario" onClick={() => navegar('/admin/solucoes')}>
              Ir para Soluções
            </Botao>
          }
        />
      ) : modelos.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">🗂️</span>}
          titulo="Nenhum modelo cadastrado"
          descricao='Monte o primeiro pacote — por exemplo, "Avaliações padrão": diagnóstica, simulado e correção de redação juntos, prontos pro gestor aplicar de uma vez.'
          acao={<Botao onClick={() => navegar('/admin/modelos/novo')}>Cadastrar o primeiro</Botao>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {modelos.map((m) => (
            <Cartao key={m.id} className="gap-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-brand">{m.nome}</h3>
                    <Selo tom={SELO_VISIBILIDADE[m.visibilidade].tom}>
                      {SELO_VISIBILIDADE[m.visibilidade].rotulo}
                    </Selo>
                  </div>
                  <span className="text-sm text-gray-500">
                    {m.categoria} · {m.produtoIds.length} soluç
                    {m.produtoIds.length === 1 ? 'ão' : 'ões'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Botao
                    variante="secundario"
                    tamanho="sm"
                    onClick={() => navegar(`/admin/modelos/${m.id}/editar`)}
                  >
                    Editar
                  </Botao>
                  <Botao variante="fantasma" tamanho="sm" onClick={() => setExcluindo(m)}>
                    Excluir
                  </Botao>
                </div>
              </div>

              {m.descricao && <p className="text-sm text-gray-500">{m.descricao}</p>}

              <div className="flex flex-wrap gap-1.5">
                {m.produtoIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600"
                  >
                    {nomeProduto(id)}
                  </span>
                ))}
              </div>
            </Cartao>
          ))}
        </div>
      )}

      <DialogoConfirmacao
        aberto={!!excluindo}
        nivel="medio"
        titulo="Excluir modelo"
        descricao="O pacote deixa de aparecer na etapa de escolha do gestor. As soluções em si continuam no catálogo — só o atalho de aplicar todas juntas some."
        detalhe={
          excluindo && (
            <div className="flex flex-col gap-1">
              <span>
                <strong>{excluindo.nome}</strong> · {excluindo.produtoIds.length} solução
                {excluindo.produtoIds.length === 1 ? '' : 'ões'}
              </span>
              <span className="text-xs">
                Pedidos já preenchidos a partir deste modelo não mudam — a decisão já foi gravada
                em cada solução.
              </span>
            </div>
          )
        }
        textoConfirmar="Excluir modelo"
        carregando={apagando}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={() => {
          const alvo = excluindo;
          if (!alvo) return;
          setExcluindo(null);
          setApagando(true);
          void excluirModelo(alvo.id)
            .then(carregar)
            .catch(() => setErro('Não foi possível excluir. Tente de novo.'))
            .finally(() => setApagando(false));
        }}
      />
    </div>
  );
}
