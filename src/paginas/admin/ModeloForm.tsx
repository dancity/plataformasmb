import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Botao, Campo, Entrada, EsqueletoLinhas, EstadoVazio, Selecao } from '@/componentes/ui';
import {
  atualizarModelo,
  criarModelo,
  listarFornecedores,
  listarProdutos,
  obterModelo,
} from '@/lib/dados';
import type { Fornecedor, Produto, Visibilidade } from '@dominio/tipos';
import { descreverPreco } from '@dominio/preco';
import { useAdmin } from './LayoutAdmin';

/**
 * Cadastro de modelo, em página cheia — mesma razão da página de solução:
 * a lista de avaliações pode ser longa, e não cabe bem numa caixa de altura
 * fixa. Nada aqui restringe a categoria das soluções escolhidas, mas na
 * prática modelo só existe pra avaliação — é por isso que os textos falam
 * em "avaliações" em vez de "soluções" em geral.
 */

interface Rascunho {
  nome: string;
  descricao: string;
  categoria: string;
  visibilidade: Visibilidade;
  produtoIds: string[];
}

const VAZIO: Rascunho = {
  nome: '',
  descricao: '',
  categoria: 'Avaliação',
  visibilidade: 'rascunho',
  produtoIds: [],
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
          produtoIds: modelo.produtoIds,
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

  function alternarProduto(id: string) {
    setRascunho((r) => ({
      ...r,
      produtoIds: r.produtoIds.includes(id)
        ? r.produtoIds.filter((p) => p !== id)
        : [...r.produtoIds, id],
    }));
  }

  async function salvar() {
    if (!ciclo) return;
    setSalvando(true);
    setErro(null);
    try {
      if (!rascunho.nome.trim()) throw new Error('O modelo precisa de um nome.');
      if (rascunho.produtoIds.length === 0) {
        throw new Error('Marque pelo menos uma avaliação para o modelo.');
      }

      // Mantém a ordem do catálogo — mesma sequência que o gestor vê na
      // etapa de escolha, não a ordem em que foram marcadas aqui.
      const ordemCatalogo = new Map(produtos.map((p, i) => [p.id, i]));
      const produtoIds = [...rascunho.produtoIds].sort(
        (a, b) => (ordemCatalogo.get(a) ?? 0) - (ordemCatalogo.get(b) ?? 0),
      );

      const dados = {
        cicloId: ciclo.id,
        nome: rascunho.nome.trim(),
        descricao: rascunho.descricao.trim(),
        categoria: rascunho.categoria.trim() || 'Avaliação',
        visibilidade: rascunho.visibilidade,
        produtoIds,
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

  const selecionados = new Set(rascunho.produtoIds);

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
          Marque as avaliações que entram juntas neste pacote fechado. Ao aplicar o modelo, o
          gestor marca todas de uma vez, em todos os anos habilitados pra regional dele, puxando a
          previsão de alunos automaticamente — e o pacote fica travado: pra ajustar qualquer
          avaliação depois, é preciso remover o modelo inteiro, não mexer nela isolada.
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
            {rascunho.produtoIds.length} selecionada{rascunho.produtoIds.length === 1 ? '' : 's'}
          </span>
        </legend>

        <Entrada
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, categoria ou fornecedor…"
        />

        <div className="flex max-h-[28rem] flex-col gap-4 overflow-y-auto pr-1">
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
