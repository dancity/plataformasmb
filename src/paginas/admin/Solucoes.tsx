import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DialogoConfirmacao } from '@/componentes/Modal';
import {
  Botao,
  Cartao,
  EsqueletoLinhas,
  EstadoVazio,
  IconeDescer,
  IconeDuplicar,
  IconeEditar,
  IconeExcluir,
  IconeSubir,
  LogoFornecedor,
  Selo,
} from '@/componentes/ui';
import {
  duplicarProduto,
  excluirProduto,
  excluirTodosProdutos,
  listarFornecedores,
  listarProdutos,
  reordenarProdutos,
} from '@/lib/dados';
import type { Fornecedor, Produto } from '@dominio/tipos';
import { descreverPreco, formatarBRL } from '@dominio/preco';
import { useAdmin } from './LayoutAdmin';

/**
 * Seta do punho de reordenar. Não usa o `Botao` de ação de propósito: no
 * tamanho `icone` a pilha de duas setas fica mais alta que o conteúdo do
 * cartão e passa a ditar a altura da lista inteira. Aqui ela tem 28px — o
 * piso de alvo clicável em tela de mouse — e o cartão volta a ter a altura
 * do que está escrito nele.
 */
function BotaoOrdem({
  rotulo,
  titulo,
  desabilitado,
  aoClicar,
  children,
}: {
  rotulo: string;
  titulo: string;
  desabilitado: boolean;
  aoClicar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={titulo}
      disabled={desabilitado}
      onClick={aoClicar}
      className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

const SELO_VISIBILIDADE = {
  rascunho: { tom: 'neutro', rotulo: 'rascunho' },
  publicado: { tom: 'ok', rotulo: 'publicada' },
  suspenso: { tom: 'atencao', rotulo: 'suspensa' },
} as const;

export function Solucoes() {
  const { ciclo } = useAdmin();
  const navegar = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [excluindo, setExcluindo] = useState<Produto | null>(null);
  const [apagando, setApagando] = useState(false);
  const [excluindoTudo, setExcluindoTudo] = useState(false);
  const [apagandoTudo, setApagandoTudo] = useState(false);
  const [duplicando, setDuplicando] = useState<string | null>(null);

  const duplicar = useCallback(
    (produtoId: string) => {
      setErro(null);
      setDuplicando(produtoId);
      void duplicarProduto(produtoId)
        .then((novoId) => navegar(`/admin/solucoes/${novoId}/editar`))
        .catch(() => setErro('Não foi possível duplicar. Tente de novo.'))
        .finally(() => setDuplicando(null));
    },
    [navegar],
  );

  const carregar = useCallback(async () => {
    if (!ciclo) {
      setCarregando(false);
      return;
    }
    setErro(null);
    try {
      const [ps, fs] = await Promise.all([listarProdutos(ciclo.id), listarFornecedores()]);
      setProdutos(ps);
      setFornecedores(fs);
    } catch {
      setErro('Não foi possível carregar o catálogo. Recarregue a página.');
    } finally {
      setCarregando(false);
    }
  }, [ciclo]);

  /**
   * Sobe ou desce uma solução. A tela responde na hora e o Firestore confirma
   * depois: reordenar é gesto repetido, e esperar a ida e volta a cada clique
   * transformaria uma arrumação de trinta segundos numa fila de espera. Se a
   * gravação falhar, a lista recarrega — vale o que está gravado, nunca uma
   * ordem que só existe nesta aba.
   */
  const mover = useCallback(
    (indice: number, direcao: -1 | 1) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= produtos.length) return;

      const nova = [...produtos];
      const [movida] = nova.splice(indice, 1);
      nova.splice(destino, 0, movida!);
      setProdutos(nova);
      setErro(null);

      void reordenarProdutos(nova).catch(() => {
        setErro('Não foi possível salvar a nova ordem. A lista voltou para a ordem gravada.');
        void carregar();
      });
    },
    [produtos, carregar],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!ciclo) {
    return (
      <EstadoVazio
        icone={<span aria-hidden="true">⌛</span>}
        titulo="Crie o ciclo antes do catálogo"
        descricao="Toda solução pertence a um ciclo — é isso que permite mudar preços no ano que vem sem corromper o histórico deste. Volte à aba Ciclo e crie o de 2027."
      />
    );
  }

  if (carregando) return <EsqueletoLinhas linhas={5} />;

  const fornecedorDe = (id: string) => fornecedores.find((f) => f.id === id);
  const nomeFornecedor = (id: string) => fornecedorDe(id)?.nome ?? '—';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-brand">Soluções do ciclo {ciclo.anoAlvo}</h1>
          <p className="text-sm text-gray-500">
            A ordem aqui é a ordem em que o gestor decide, uma solução por vez — use as setas
            para arrumar. Obrigatórias primeiro, para ele conhecer o piso do orçamento antes de
            escolher qualquer opcional.
          </p>
        </div>
        <div className="flex gap-2">
          <Botao
            onClick={() => navegar('/admin/solucoes/novo')}
            disabled={fornecedores.length === 0}
          >
            Nova solução
          </Botao>
          {/* Destrutiva: fica depois da ação de rotina, não ao lado dela —
              não é o botão que a mão deveria encontrar primeiro. */}
          {produtos.length > 0 && (
            <Botao variante="fantasma" onClick={() => setExcluindoTudo(true)}>
              Excluir todas
            </Botao>
          )}
        </div>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {fornecedores.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">🏷️</span>}
          titulo="Cadastre um fornecedor primeiro"
          descricao="Toda solução pertence a um fornecedor, e ele é referência de cadastro, não texto livre — é o que faz o consolidado por fornecedor sair certo em novembro, sem faxina de grafia."
          acao={
            <Botao variante="secundario" onClick={() => navegar('/admin/fornecedores')}>
              Ir para Fornecedores
            </Botao>
          }
        />
      ) : produtos.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">📦</span>}
          titulo="Nenhuma solução cadastrada"
          descricao="Cadastre as soluções que as unidades poderão contratar em 2027. Cada uma precisa de preço e de pelo menos uma combinação regional × ano escolar habilitada — sem isso ela não aparece para ninguém."
          acao={
            <Botao onClick={() => navegar('/admin/solucoes/novo')}>Cadastrar a primeira</Botao>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {produtos.map((p, i) => (
            <Cartao key={p.id} className="flex-row items-start gap-3 p-5">
              {/* Na borda de entrada, como em toda lista reordenável: é o
                  primeiro lugar onde a mão procura. O número no meio diz em que
                  posição a solução está sem obrigar a contar os cartões. */}
              <div className="flex shrink-0 flex-col items-center">
                <BotaoOrdem
                  rotulo={`Subir ${p.nome} para a posição ${i}`}
                  titulo="Subir"
                  desabilitado={i === 0}
                  aoClicar={() => mover(i, -1)}
                >
                  <IconeSubir />
                </BotaoOrdem>
                <span className="font-mono text-[11px] leading-none text-gray-400 tabular-nums">
                  {i + 1}
                </span>
                <BotaoOrdem
                  rotulo={`Descer ${p.nome} para a posição ${i + 2}`}
                  titulo="Descer"
                  desabilitado={i === produtos.length - 1}
                  aoClicar={() => mover(i, 1)}
                >
                  <IconeDescer />
                </BotaoOrdem>
              </div>
              <LogoFornecedor
                nome={nomeFornecedor(p.fornecedorId)}
                logo={fornecedorDe(p.fornecedorId)?.logo}
                tamanho="md"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-brand">{p.nome}</h3>
                      <Selo tom={SELO_VISIBILIDADE[p.visibilidade].tom}>
                        {SELO_VISIBILIDADE[p.visibilidade].rotulo}
                      </Selo>
                    </div>
                    <span className="text-sm text-gray-500">
                      {nomeFornecedor(p.fornecedorId)} · {p.categoria}
                    </span>
                    <span className="font-mono text-xs text-gray-500">
                      {descreverPreco(p.precificacao)}
                    </span>
                  </div>
                <div className="flex gap-2">
                  <Botao
                    variante="secundario"
                    tamanho="icone"
                    aria-label="Editar solução"
                    title="Editar"
                    onClick={() => navegar(`/admin/solucoes/${p.id}/editar`)}
                  >
                    <IconeEditar />
                  </Botao>
                  <Botao
                    variante="secundario"
                    tamanho="icone"
                    aria-label="Duplicar solução"
                    title="Duplicar"
                    carregando={duplicando === p.id}
                    disabled={duplicando !== null && duplicando !== p.id}
                    onClick={() => duplicar(p.id)}
                  >
                    <IconeDuplicar />
                  </Botao>
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label="Excluir solução"
                    title="Excluir"
                    onClick={() => setExcluindo(p)}
                  >
                    <IconeExcluir />
                  </Botao>
                  </div>
                </div>
                {p.descricao && <p className="text-sm text-gray-500">{p.descricao}</p>}
              </div>
            </Cartao>
          ))}
        </div>
      )}

      <DialogoConfirmacao
        aberto={!!excluindo}
        nivel="perigo"
        titulo="Excluir solução"
        descricao="A solução e todas as suas regras de habilitação saem do catálogo."
        detalhe={
          excluindo && (
            <div className="flex flex-col gap-1">
              <span>
                <strong>{excluindo.nome}</strong> · {nomeFornecedor(excluindo.fornecedorId)}
              </span>
              <span>{descreverPreco(excluindo.precificacao)}</span>
              <span className="text-xs">
                Pedidos já enviados não mudam: eles guardam cópia do preço e dos anos escolhidos.
              </span>
            </div>
          )
        }
        textoConfirmar="Excluir solução"
        textoParaDigitar={excluindo?.nome}
        carregando={apagando}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={() => {
          const alvo = excluindo;
          if (!alvo) return;
          setExcluindo(null);
          setApagando(true);
          void excluirProduto(alvo.id)
            .then(carregar)
            .catch(() => setErro('Não foi possível excluir. Tente de novo.'))
            .finally(() => setApagando(false));
        }}
      />

      <DialogoConfirmacao
        aberto={excluindoTudo}
        nivel="perigo"
        titulo="Excluir todas as soluções"
        descricao={`Apaga as ${produtos.length} soluções do ciclo ${ciclo.anoAlvo} e todas as regras de habilitação — o catálogo volta a ficar vazio. Pedidos já enviados não mudam: eles guardam cópia do preço e dos anos escolhidos.`}
        textoConfirmar="Excluir todas"
        textoParaDigitar="excluir tudo"
        carregando={apagandoTudo}
        aoCancelar={() => setExcluindoTudo(false)}
        aoConfirmar={() => {
          setExcluindoTudo(false);
          setApagandoTudo(true);
          void excluirTodosProdutos(ciclo.id)
            .then(carregar)
            .catch(() => setErro('Não foi possível excluir todas. Tente de novo.'))
            .finally(() => setApagandoTudo(false));
        }}
      />

      {produtos.length > 0 && (
        <p className="text-xs text-gray-500">
          Total do catálogo: {produtos.length} soluç{produtos.length === 1 ? 'ão' : 'ões'} ·{' '}
          {produtos.filter((p) => p.visibilidade === 'publicado').length} publicada(s) ·{' '}
          preço médio por unidade de cobrança{' '}
          {formatarBRL(
            Math.round(
              produtos.reduce((s, p) => s + p.precificacao.valor, 0) / Math.max(produtos.length, 1),
            ),
          )}
        </p>
      )}
    </div>
  );
}
