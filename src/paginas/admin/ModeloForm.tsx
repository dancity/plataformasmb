import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Botao, Campo, Entrada, EsqueletoLinhas, EstadoVazio, Selecao, juntar } from '@/componentes/ui';
import {
  atualizarModelo,
  criarModelo,
  listarFornecedores,
  listarProdutos,
  obterModelo,
} from '@/lib/dados';
import type { Fornecedor, ItemModelo, Produto, Visibilidade } from '@dominio/tipos';
import { descreverPreco } from '@dominio/preco';
import { ANOS_ESCOLARES, SEGMENTOS, anosDoSegmento, ordenarAnos } from '@dominio/anosEscolares';
import type { AnoEscolarId } from '@dominio/anosEscolares';
import { useAdmin } from './LayoutAdmin';

/**
 * Cadastro de modelo, em página cheia — mesma razão da página de solução:
 * a lista de avaliações pode ser longa, e não cabe bem numa caixa de altura
 * fixa. Nada aqui restringe a categoria das soluções escolhidas, mas na
 * prática modelo só existe pra avaliação — é por isso que os textos falam
 * em "avaliações" em vez de "soluções" em geral.
 *
 * Cada avaliação do pacote carrega seus próprios anos escolares — não é
 * herdado da habilitação de nenhuma regional (o modelo é do ciclo, não de
 * uma regional específica). Na hora de aplicar, esses anos ainda passam
 * pelo crivo do que a regional do gestor realmente habilita.
 */

const TODOS_OS_ANOS: AnoEscolarId[] = ANOS_ESCOLARES.map((a) => a.id);

interface Rascunho {
  nome: string;
  descricao: string;
  categoria: string;
  visibilidade: Visibilidade;
  itens: ItemModelo[];
}

const VAZIO: Rascunho = {
  nome: '',
  descricao: '',
  categoria: 'Avaliação',
  visibilidade: 'rascunho',
  itens: [],
};

export function ModeloForm() {
  const { ciclo } = useAdmin();
  const navegar = useNavigate();
  const { modeloId } = useParams<{ modeloId: string }>();
  const editando = !!modeloId;

  const [carregando, setCarregando] = useState(true);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const carregar = useCallback(async () => {
    if (!ciclo) {
      setCarregando(false);
      return;
    }
    try {
      const [ps, fs] = await Promise.all([listarProdutos(ciclo.id), listarFornecedores()]);
      setProdutos(ps);
      setFornecedores(fs);

      if (modeloId) {
        const modelo = await obterModelo(modeloId);
        if (!modelo) {
          setNaoEncontrado(true);
          return;
        }
        setRascunho({
          nome: modelo.nome,
          descricao: modelo.descricao,
          categoria: modelo.categoria,
          visibilidade: modelo.visibilidade,
          itens: modelo.itens,
        });
      }
    } catch {
      setErro('Não foi possível carregar os dados. Recarregue a página.');
    } finally {
      setCarregando(false);
    }
  }, [ciclo, modeloId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const nomeFornecedor = (id: string) => fornecedores.find((f) => f.id === id)?.nome ?? '—';
  const nomeProduto = (id: string) => produtos.find((p) => p.id === id)?.nome ?? '(solução removida)';

  // Ordem do catálogo — mesma sequência que o gestor vê na etapa de escolha,
  // reaproveitada tanto pra listar "anos por avaliação" quanto pra salvar.
  const ordemCatalogo = useMemo(() => new Map(produtos.map((p, i) => [p.id, i])), [produtos]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return produtos;
    return produtos.filter(
      (p) =>
        p.nome.toLowerCase().includes(termo) ||
        p.categoria.toLowerCase().includes(termo) ||
        nomeFornecedor(p.fornecedorId).toLowerCase().includes(termo),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, busca, fornecedores]);

  const porCategoria = useMemo(() => {
    const grupos = new Map<string, Produto[]>();
    for (const p of produtosFiltrados) {
      (grupos.get(p.categoria) ?? grupos.set(p.categoria, []).get(p.categoria)!).push(p);
    }
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [produtosFiltrados]);

  // Os itens já escolhidos, na ordem do catálogo — é nessa ordem que a
  // seção "anos por avaliação" lista pra ficar previsível de achar.
  const itensNaOrdemDoCatalogo = useMemo(
    () =>
      [...rascunho.itens].sort(
        (a, b) => (ordemCatalogo.get(a.produtoId) ?? 0) - (ordemCatalogo.get(b.produtoId) ?? 0),
      ),
    [rascunho.itens, ordemCatalogo],
  );

  function alternarProduto(produtoId: string) {
    setRascunho((r) => {
      const jaTem = r.itens.some((i) => i.produtoId === produtoId);
      return {
        ...r,
        // Nasce sem nenhum ano marcado — o catálogo não sabe pra quais anos
        // esta avaliação faz sentido, então "todos" por padrão só empilhava
        // anos que nunca se aplicam a ela (uma avaliação do Médio herdando
        // Educação Infantil, por exemplo). "Marcar todos" abaixo cobre o
        // caso oposto, o de uma avaliação que vale pra todo mundo, num clique.
        itens: jaTem
          ? r.itens.filter((i) => i.produtoId !== produtoId)
          : [...r.itens, { produtoId, anos: [] }],
      };
    });
  }

  function alternarAno(produtoId: string, ano: AnoEscolarId) {
    setRascunho((r) => ({
      ...r,
      itens: r.itens.map((i) =>
        i.produtoId !== produtoId
          ? i
          : {
              ...i,
              anos: i.anos.includes(ano)
                ? i.anos.filter((a) => a !== ano)
                : ordenarAnos([...i.anos, ano]),
            },
      ),
    }));
  }

  function definirTodosOsAnos(produtoId: string, marcarTodos: boolean) {
    setRascunho((r) => ({
      ...r,
      itens: r.itens.map((i) =>
        i.produtoId !== produtoId ? i : { ...i, anos: marcarTodos ? TODOS_OS_ANOS : [] },
      ),
    }));
  }

  async function salvar() {
    if (!ciclo) return;
    setSalvando(true);
    setErro(null);
    try {
      if (!rascunho.nome.trim()) throw new Error('O modelo precisa de um nome.');
      if (rascunho.itens.length === 0) {
        throw new Error('Marque pelo menos uma avaliação para o modelo.');
      }
      const semAno = rascunho.itens.find((i) => i.anos.length === 0);
      if (semAno) {
        throw new Error(
          `"${nomeProduto(semAno.produtoId)}" está sem nenhum ano escolar marcado — escolha ao menos um ou desmarque a avaliação.`,
        );
      }

      const itens = itensNaOrdemDoCatalogo.map((i) => ({ ...i, anos: ordenarAnos(i.anos) }));

      const dados = {
        cicloId: ciclo.id,
        nome: rascunho.nome.trim(),
        descricao: rascunho.descricao.trim(),
        categoria: rascunho.categoria.trim() || 'Avaliação',
        visibilidade: rascunho.visibilidade,
        itens,
      };

      if (editando) await atualizarModelo(modeloId!, dados);
      else await criarModelo(dados);

      navegar('/admin/modelos');
    } catch (e) {
      setErro((e as Error).message ?? 'Não deu certo. Confira os campos.');
    } finally {
      setSalvando(false);
    }
  }

  if (!ciclo) {
    return (
      <EstadoVazio
        icone={<span aria-hidden="true">⌛</span>}
        titulo="Crie o ciclo antes dos modelos"
        descricao="Volte à aba Ciclo e crie o ciclo antes de montar um modelo."
      />
    );
  }

  if (carregando) return <EsqueletoLinhas linhas={8} />;

  if (naoEncontrado) {
    return (
      <EstadoVazio
        icone={<span aria-hidden="true">🔍</span>}
        titulo="Modelo não encontrado"
        descricao="Ele pode ter sido excluído. Volte para a lista e tente de novo."
        acao={<Botao onClick={() => navegar('/admin/modelos')}>Voltar para Modelos</Botao>}
      />
    );
  }

  const selecionados = new Set(rascunho.itens.map((i) => i.produtoId));

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => navegar('/admin/modelos')}
          className="w-fit text-sm text-gray-500 hover:text-gray-700"
        >
          ← Voltar para Modelos
        </button>
        <h1 className="text-xl font-semibold text-brand">
          {editando ? 'Editar modelo' : 'Novo modelo'}
        </h1>
        <p className="max-w-prose text-sm text-gray-500">
          Marque as avaliações que entram juntas neste pacote fechado, e em quais anos escolares
          cada uma se aplica. Ao aplicar o modelo, o gestor marca tudo de uma vez — cada avaliação
          nos anos escolhidos aqui que a regional dele também habilitar, com a previsão de alunos
          puxada automaticamente. O pacote fica travado: pra ajustar qualquer avaliação depois, é
          preciso remover o modelo inteiro, não mexer nela isolada.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome do modelo" obrigatorio>
          <Entrada
            value={rascunho.nome}
            onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            placeholder="Avaliações padrão 2027"
          />
        </Campo>

        <Campo
          rotulo="Categoria"
          dica='Livre, só pra organizar a lista de modelos — hoje é sempre "Avaliação".'
        >
          <Entrada
            value={rascunho.categoria}
            onChange={(e) => setRascunho({ ...rascunho, categoria: e.target.value })}
            placeholder="Avaliação"
          />
        </Campo>
      </div>

      <Campo
        rotulo="Descrição"
        dica="O que esse pacote resolve. É o que o gestor lê antes de aplicar."
      >
        <textarea
          value={rascunho.descricao}
          onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
          rows={2}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-medium focus:outline-none"
          placeholder="Diagnóstica, simulado e correção de redação juntos — o combo que toda unidade contrata."
        />
      </Campo>

      <Campo
        rotulo="Visibilidade"
        dica="Publicado é o que aparece pro gestor aplicar. Cadastrar não deveria publicar."
      >
        <Selecao
          value={rascunho.visibilidade}
          onChange={(e) => setRascunho({ ...rascunho, visibilidade: e.target.value as Visibilidade })}
          className="max-w-xs"
        >
          <option value="rascunho">Rascunho — só a administração vê</option>
          <option value="publicado">Publicado — o gestor pode aplicar</option>
          <option value="suspenso">Suspenso — retirado da etapa de escolha</option>
        </Selecao>
      </Campo>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4">
        <legend className="px-1 text-sm font-medium text-gray-700">
          Avaliações do pacote
          <span className="ml-2 font-normal text-gray-500">
            {rascunho.itens.length} selecionada{rascunho.itens.length === 1 ? '' : 's'}
          </span>
        </legend>

        <Entrada
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, categoria ou fornecedor…"
        />

        <div className="flex max-h-[24rem] flex-col gap-4 overflow-y-auto pr-1">
          {porCategoria.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">Nenhuma solução encontrada.</p>
          ) : (
            porCategoria.map(([categoria, itens]) => (
              <div key={categoria} className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] tracking-wider text-gray-500 uppercase">
                  {categoria}
                </span>
                <div className="flex flex-col gap-1">
                  {itens.map((p) => {
                    const marcado = selecionados.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternarProduto(p.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand-medium)]"
                        />
                        <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <span className="text-sm text-gray-800">{p.nome}</span>
                          <span className="font-mono text-xs text-gray-500">
                            {nomeFornecedor(p.fornecedorId)} · {descreverPreco(p.precificacao)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </fieldset>

      {itensNaOrdemDoCatalogo.length > 0 && (
        <fieldset className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4">
          <legend className="px-1 text-sm font-medium text-gray-700">Anos por avaliação</legend>
          <p className="-mt-2 text-xs text-gray-500">
            Em quais anos escolares cada avaliação entra ao aplicar o modelo — nasce sem nenhum
            marcado, "marcar todos" resolve o caso de uma avaliação que vale pra rede inteira. Um
            ano marcado aqui que a regional do gestor não habilitar pra esta avaliação
            simplesmente não entra.
          </p>

          <div className="flex flex-col gap-4 divide-y divide-gray-100">
            {itensNaOrdemDoCatalogo.map((item) => {
              const todosMarcados = item.anos.length === TODOS_OS_ANOS.length;
              return (
                <div key={item.produtoId} className="flex flex-col gap-2 pt-4 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {nomeProduto(item.produtoId)}
                    </span>
                    <button
                      type="button"
                      onClick={() => definirTodosOsAnos(item.produtoId, !todosMarcados)}
                      className="text-xs text-brand-medium hover:underline"
                    >
                      {todosMarcados ? 'limpar' : 'marcar todos'}
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {SEGMENTOS.map((seg) => (
                      <div
                        key={seg.id}
                        className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center"
                      >
                        <span className="text-xs text-gray-500">{seg.nome}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {anosDoSegmento(seg.id).map((ano) => {
                            const ligado = item.anos.includes(ano.id);
                            return (
                              <button
                                key={ano.id}
                                type="button"
                                aria-pressed={ligado}
                                onClick={() => alternarAno(item.produtoId, ano.id)}
                                className={juntar(
                                  'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                                  ligado
                                    ? 'border-brand-medium bg-brand-medium text-white'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                                )}
                              >
                                {ano.curto}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-gray-200 bg-white/95 px-6 py-3 backdrop-blur-sm">
        <Botao variante="secundario" onClick={() => navegar('/admin/modelos')} disabled={salvando}>
          Cancelar
        </Botao>
        <Botao onClick={() => void salvar()} carregando={salvando}>
          {editando ? 'Salvar alterações' : 'Cadastrar modelo'}
        </Botao>
      </div>
    </div>
  );
}
