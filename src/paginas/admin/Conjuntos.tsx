import { useCallback, useEffect, useMemo, useState } from 'react';
import { DialogoConfirmacao, Modal } from '@/componentes/Modal';
import {
  AreaTexto,
  Botao,
  Campo,
  Cartao,
  Entrada,
  EsqueletoLinhas,
  EstadoVazio,
  IconeEditar,
  IconeExcluir,
  Selecao,
  Selo,
  juntar,
} from '@/componentes/ui';
import {
  atualizarConjunto,
  criarConjunto,
  excluirConjunto,
  listarConjuntos,
  listarProdutos,
} from '@/lib/dados';
import type { Conjunto, Produto, Visibilidade } from '@dominio/tipos';
import { useAdmin } from './LayoutAdmin';

/**
 * Conjuntos de escolha única: soluções que competem entre si e que a unidade
 * leva no máximo uma por ano escolar.
 *
 * Coleção própria, e não um código repetido em cada produto, porque o
 * conjunto tem nome e descrição — é ele que titula a tela do gestor — e
 * porque montar um grupo marcando N soluções com o mesmo rótulo é o tipo de
 * cadastro que fica pela metade sem ninguém perceber.
 */

const SELO_VISIBILIDADE = {
  rascunho: { tom: 'neutro', rotulo: 'rascunho' },
  publicado: { tom: 'ok', rotulo: 'publicado' },
  suspenso: { tom: 'atencao', rotulo: 'suspenso' },
} as const;

export function Conjuntos() {
  const { ciclo } = useAdmin();
  const [carregando, setCarregando] = useState(true);
  const [conjuntos, setConjuntos] = useState<Conjunto[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Conjunto | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [produtoIds, setProdutoIds] = useState<string[]>([]);
  const [visibilidade, setVisibilidade] = useState<Visibilidade>('rascunho');
  const [salvando, setSalvando] = useState(false);

  const [excluindo, setExcluindo] = useState<Conjunto | null>(null);
  const [apagando, setApagando] = useState(false);

  const carregar = useCallback(async () => {
    if (!ciclo) {
      setCarregando(false);
      return;
    }
    try {
      const [cs, ps] = await Promise.all([listarConjuntos(ciclo.id), listarProdutos(ciclo.id)]);
      setConjuntos(cs);
      setProdutos(ps);
    } catch {
      setErro('Não foi possível carregar os conjuntos.');
    } finally {
      setCarregando(false);
    }
  }, [ciclo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const nomeProduto = useCallback(
    (id: string) => produtos.find((p) => p.id === id)?.nome ?? id,
    [produtos],
  );

  /**
   * Uma solução em dois conjuntos não tem resposta: os dois reivindicariam o
   * mesmo ano. O cadastro esconde quem já está em outro em vez de aceitar e
   * quebrar na tela do gestor.
   */
  const jaEmOutro = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of conjuntos) {
      if (editando && c.id === editando.id) continue;
      for (const id of c.produtoIds) mapa.set(id, c.nome);
    }
    return mapa;
  }, [conjuntos, editando]);

  function abrirNovo() {
    setEditando(null);
    setNome('');
    setDescricao('');
    setProdutoIds([]);
    setVisibilidade('rascunho');
    setErro(null);
    setAberto(true);
  }

  function abrirEdicao(c: Conjunto) {
    setEditando(c);
    setNome(c.nome);
    setDescricao(c.descricao);
    setProdutoIds(c.produtoIds);
    setVisibilidade(c.visibilidade);
    setErro(null);
    setAberto(true);
  }

  async function salvar() {
    if (!ciclo) return;
    setSalvando(true);
    setErro(null);
    try {
      if (!nome.trim()) throw new Error('O conjunto precisa de um nome.');
      if (produtoIds.length < 2) {
        throw new Error('Escolha pelo menos duas soluções — com uma só não há o que disputar.');
      }
      const dados = {
        cicloId: ciclo.id,
        nome: nome.trim(),
        descricao: descricao.trim(),
        produtoIds,
        visibilidade,
      };
      if (editando) await atualizarConjunto(editando.id, dados);
      else await criarConjunto(dados);
      setAberto(false);
      await carregar();
    } catch (e) {
      setErro((e as Error).message ?? 'Não deu certo.');
    } finally {
      setSalvando(false);
    }
  }

  if (!ciclo) {
    return (
      <EstadoVazio
        icone={<span aria-hidden="true">⌛</span>}
        titulo="Crie o ciclo antes dos conjuntos"
        descricao="Um conjunto agrupa soluções de um ciclo. Volte à aba Ciclo e crie o de 2027."
      />
    );
  }

  if (carregando) return <EsqueletoLinhas linhas={3} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-brand">Conjuntos de escolha única</h1>
          <p className="max-w-prose text-sm text-gray-500">
            Soluções que competem entre si: a unidade leva no máximo uma delas em cada ano escolar,
            e pode levar todas em anos diferentes. Para o gestor, o conjunto vira uma decisão só —
            uma tabela de ano × solução, com os preços lado a lado.
          </p>
        </div>
        <Botao onClick={abrirNovo} disabled={produtos.length < 2}>
          Novo conjunto
        </Botao>
      </div>

      {erro && !aberto && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {produtos.length < 2 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">📦</span>}
          titulo="Cadastre as soluções primeiro"
          descricao="Um conjunto é feito de soluções que já existem no catálogo — pelo menos duas, senão não há escolha a fazer."
        />
      ) : conjuntos.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">🔀</span>}
          titulo="Nenhum conjunto cadastrado"
          descricao="Crie um quando duas soluções não puderem ser contratadas no mesmo ano escolar — como duas trilhas alternativas do mesmo fornecedor."
          acao={<Botao onClick={abrirNovo}>Criar o primeiro</Botao>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {conjuntos.map((c) => (
            <Cartao key={c.id} className="gap-2 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-brand">{c.nome}</h3>
                    <Selo tom={SELO_VISIBILIDADE[c.visibilidade].tom}>
                      {SELO_VISIBILIDADE[c.visibilidade].rotulo}
                    </Selo>
                  </div>
                  <span className="text-sm text-gray-500">
                    {c.produtoIds.map(nomeProduto).join('  ·  ')}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Botao
                    variante="secundario"
                    tamanho="icone"
                    aria-label={`Editar ${c.nome}`}
                    title="Editar"
                    onClick={() => abrirEdicao(c)}
                  >
                    <IconeEditar />
                  </Botao>
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label={`Excluir ${c.nome}`}
                    title="Excluir"
                    onClick={() => setExcluindo(c)}
                  >
                    <IconeExcluir />
                  </Botao>
                </div>
              </div>
              {c.descricao && <p className="text-sm text-gray-500">{c.descricao}</p>}
            </Cartao>
          ))}
        </div>
      )}

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={editando ? 'Editar conjunto' : 'Novo conjunto'}
        descricao="A unidade vai escolher uma destas soluções por ano escolar."
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void salvar()} carregando={salvando}>
              {editando ? 'Salvar alterações' : 'Criar conjunto'}
            </Botao>
          </>
        }
      >
        <Campo rotulo="Nome" obrigatorio dica="É o título que o gestor lê na etapa de escolha.">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ZOOM" />
        </Campo>

        <Campo
          rotulo="Descrição"
          dica="Opcional. Um parágrafo sobre o que diferencia as trilhas."
        >
          <AreaTexto
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Duas trilhas do mesmo fornecedor: a escola escolhe uma por ano escolar."
          />
        </Campo>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">
            Soluções do conjunto
            <span className="ml-1 text-red-600">*</span>
          </span>
          <span className="text-xs text-gray-500">
            Pelo menos duas. A ordem aqui é a ordem das colunas na tabela do gestor.
          </span>
          <div className="mt-1 flex flex-col gap-1.5">
            {produtos.map((p) => {
              const outro = jaEmOutro.get(p.id);
              const marcado = produtoIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={juntar(
                    'flex items-center gap-2 text-sm',
                    outro ? 'text-gray-400' : 'text-gray-700',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={!!outro}
                    onChange={(e) =>
                      setProdutoIds(
                        e.target.checked
                          ? [...produtoIds, p.id]
                          : produtoIds.filter((id) => id !== p.id),
                      )
                    }
                    className="h-4 w-4 accent-[var(--color-brand-medium)] disabled:opacity-50"
                  />
                  {p.nome}
                  {outro && <span className="text-xs">— já está em “{outro}”</span>}
                </label>
              );
            })}
          </div>
        </div>

        <Campo
          rotulo="Visibilidade"
          dica="Publicado é o que o gestor vê. Cadastrar não deveria publicar."
        >
          <Selecao
            value={visibilidade}
            onChange={(e) => setVisibilidade(e.target.value as Visibilidade)}
          >
            <option value="rascunho">Rascunho — só o admin vê</option>
            <option value="publicado">Publicado — visível para as unidades</option>
            <option value="suspenso">Suspenso — sai da escolha</option>
          </Selecao>
        </Campo>

        {erro && aberto && (
          <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {erro}
          </p>
        )}
      </Modal>

      <DialogoConfirmacao
        aberto={!!excluindo}
        nivel="medio"
        titulo="Excluir conjunto"
        descricao="As soluções continuam no catálogo — o que acaba é a regra de elas não poderem dividir o mesmo ano escolar."
        detalhe={
          excluindo && (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">{excluindo.nome}</span>
              <span className="text-xs">{excluindo.produtoIds.map(nomeProduto).join(', ')}</span>
            </div>
          )
        }
        textoConfirmar="Excluir conjunto"
        carregando={apagando}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={() => {
          const alvo = excluindo;
          if (!alvo) return;
          setExcluindo(null);
          setApagando(true);
          void excluirConjunto(alvo.id)
            .then(carregar)
            .catch(() => setErro('Não foi possível excluir. Tente de novo.'))
            .finally(() => setApagando(false));
        }}
      />
    </div>
  );
}
