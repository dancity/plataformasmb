import { useCallback, useMemo, useState } from 'react';
import { DialogoConfirmacao, Modal } from '@/componentes/Modal';
import { Botao, Cartao, EstadoVazio, Selo, juntar } from '@/componentes/ui';
import type { Sessao } from '@/lib/auth';
import {
  calcularLinhas,
  computarItem,
  estadoDaContratacao,
  resolverItensDoModelo,
  somarTotais,
} from '@/lib/pedido';
import type { ContextoPedido, EscritorPedido, ItemParaAplicar } from '@/lib/pedido';
import { anosEfetivos } from '@dominio/habilitacao';
import { anoEscolar, anosOfertados, descreverAnos } from '@dominio/anosEscolares';
import type { AnoEscolarId } from '@dominio/anosEscolares';
import { formatarBRL } from '@dominio/preco';
import { CATEGORIA_AVALIACAO_LARGA_ESCALA } from '@dominio/tipos';
import type { Modelo } from '@dominio/tipos';

/**
 * Etapa 2 — modelo de avaliação em larga escala.
 *
 * Um modelo é um pacote fechado: a unidade adota o pacote inteiro, não
 * avaliação por avaliação. É por isso que toda solução da categoria
 * "Avaliação em larga escala" fica de fora da etapa de soluções adicionais
 * — o único jeito de contratá-la é por aqui.
 */
export function EtapaModelo({
  ctx,
  sessao,
  somenteLeitura,
  escritor,
  aoVoltar,
  aoAvancar,
  aoSalvar,
}: {
  ctx: ContextoPedido;
  sessao: Sessao;
  somenteLeitura: boolean;
  escritor: EscritorPedido;
  aoVoltar: () => void;
  aoAvancar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const linhas = useMemo(
    () => calcularLinhas(ctx),
    [ctx, sessao.regionalId],
  );

  const linhasLargaEscala = useMemo(
    () => linhas.filter((l) => l.produto.categoria === CATEGORIA_AVALIACAO_LARGA_ESCALA),
    [linhas],
  );

  const colunas = useMemo(() => anosOfertados(ctx.previsao), [ctx.previsao]);

  const modelos = ctx.modelos;
  const [modeloVisualizando, setModeloVisualizando] = useState<Modelo | null>(null);
  const [modeloEscolhido, setModeloEscolhido] = useState<Modelo | null>(null);
  const [aplicandoModelo, setAplicandoModelo] = useState(false);
  const [erroModelo, setErroModelo] = useState<string | null>(null);
  const [modeloParaRemover, setModeloParaRemover] = useState<{ id: string; nome: string } | null>(
    null,
  );
  const [removendoModelo, setRemovendoModelo] = useState(false);

  const totalAdotado = useMemo(
    () => somarTotais(linhasLargaEscala).total,
    [linhasLargaEscala],
  );

  // Obrigatória nesta categoria que nenhum modelo cobre — ainda assim entra
  // no pedido sozinha, então precisa aparecer em algum lugar desta etapa.
  const obrigatoriasSemModelo = useMemo(
    () =>
      linhasLargaEscala.filter(
        (l) => l.habilitacao.obrigatorios.length > 0 && !l.item?.origemModeloId,
      ),
    [linhasLargaEscala],
  );

  const produtosDoModelo = useCallback(
    (modeloId: string) =>
      linhas.filter((l) => l.item?.origemModeloId === modeloId).map((l) => l.produto.id),
    [linhas],
  );

  const resolucaoDe = useCallback(
    (modelo: Modelo | null) => (modelo ? resolverItensDoModelo(modelo, linhas, ctx) : null),
    [linhas, ctx],
  );

  const resolucaoEscolhido = useMemo(
    () => resolucaoDe(modeloEscolhido),
    [resolucaoDe, modeloEscolhido],
  );
  const resolucaoVisualizando = useMemo(
    () => resolucaoDe(modeloVisualizando),
    [resolucaoDe, modeloVisualizando],
  );

  // Alguma avaliação do modelo já tem decisão gravada — aplicar substitui,
  // não soma, então isso muda o nível de confirmação exigido.
  const modeloSobrescreve = useMemo(() => {
    if (!resolucaoEscolhido) return false;
    const idsDoModelo = new Set(resolucaoEscolhido.itens.map((i) => i.produto.id));
    return linhas.some((l) => idsDoModelo.has(l.produto.id) && !!l.item);
  }, [resolucaoEscolhido, linhas]);

  // Prévia de licenças e valor por avaliação — a mesma conta pura que grava
  // de verdade, só que sem gravar nada. É o que "adotar modelo" mostra antes
  // de confirmar.
  const previaItens = useMemo(() => {
    if (!resolucaoEscolhido) return [];
    return resolucaoEscolhido.itens.map(({ produto, habilitacao, fornecedorNome, previsao, decisao }: ItemParaAplicar) => {
      const item = computarItem(produto, habilitacao, fornecedorNome, previsao, decisao);
      return { produto, anos: item.anosSelecionados, alunos: item.alunosTotal, valorAnual: item.valorAnual };
    });
  }, [resolucaoEscolhido]);

  const previaTotal = useMemo(
    () => previaItens.reduce((s, i) => s + i.valorAnual, 0),
    [previaItens],
  );

  const aplicarModeloEscolhido = useCallback(async () => {
    if (!modeloEscolhido || !resolucaoEscolhido) return;
    if (resolucaoEscolhido.itens.length === 0) {
      setModeloEscolhido(null);
      return;
    }
    setAplicandoModelo(true);
    setErroModelo(null);
    try {
      await escritor.aplicarModelo(ctx.ciclo, sessao, modeloEscolhido, resolucaoEscolhido.itens);
      await aoSalvar();
      setModeloEscolhido(null);
    } catch {
      setErroModelo('Não foi possível adotar o modelo. Tente de novo.');
    } finally {
      setAplicandoModelo(false);
    }
  }, [modeloEscolhido, resolucaoEscolhido, escritor, ctx, sessao, aoSalvar]);

  /**
   * Soluções cujo pré-requisito é este modelo e que nenhum outro modelo
   * adotado sustenta. São as que ficam travadas se ele sair.
   */
  const dependemDesteModelo = useCallback(
    (modeloId: string) => {
      const restantes = new Set(
        [...estadoDaContratacao(ctx).modelosAdotados].filter((id) => id !== modeloId),
      );
      return ctx.produtos.filter((p) => {
        const exige = p.requer?.modelos ?? [];
        if (!exige.includes(modeloId)) return false;
        return !exige.some((id) => restantes.has(id));
      });
    },
    [ctx],
  );

  const removerModeloEscolhido = useCallback(async () => {
    if (!modeloParaRemover || !ctx.pedido) return;
    const produtoIds = produtosDoModelo(modeloParaRemover.id);
    if (produtoIds.length === 0) {
      setModeloParaRemover(null);
      return;
    }
    setRemovendoModelo(true);
    setErroModelo(null);
    try {
      await escritor.removerModelo(ctx.pedido.id, produtoIds);
      await aoSalvar();
      setModeloParaRemover(null);
    } catch {
      setErroModelo('Não foi possível remover o modelo. Tente de novo.');
    } finally {
      setRemovendoModelo(false);
    }
  }, [modeloParaRemover, ctx.pedido, produtosDoModelo, escritor, aoSalvar]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-brand">Modelo de avaliação em larga escala</h2>
        <p className="max-w-prose text-sm text-gray-500">
          Um modelo é um pacote fechado de avaliações: a unidade adota o pacote inteiro, não
          avaliação por avaliação. Visualize antes de decidir — ao adotar, o valor é calculado
          sobre a previsão de alunos da unidade.
        </p>
      </div>

      {erroModelo && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erroModelo}
        </p>
      )}

      {modelos.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">📐</span>}
          titulo="Nenhum modelo disponível"
          descricao="A administração ainda não publicou um modelo de avaliação em larga escala. Continue para as demais soluções."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modelos.map((m) => {
            const aplicado = linhas.some((l) => l.item?.origemModeloId === m.id);
            return (
              <Cartao key={m.id} className="gap-3 p-5">
                <div className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-base font-semibold text-brand">{m.nome}</h3>
                    {aplicado && <Selo tom="marca">adotado</Selo>}
                  </span>
                  {m.descricao && <p className="text-sm text-gray-500">{m.descricao}</p>}
                  <span className="font-mono text-[11px] tracking-wide text-gray-400 uppercase">
                    {m.itens.length} avaliaç{m.itens.length === 1 ? 'ão' : 'ões'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Botao
                    variante="secundario"
                    tamanho="sm"
                    onClick={() => setModeloVisualizando(m)}
                  >
                    Visualizar modelo
                  </Botao>
                  {aplicado ? (
                    <Botao
                      variante="fantasma"
                      tamanho="sm"
                      disabled={somenteLeitura || removendoModelo}
                      onClick={() => setModeloParaRemover({ id: m.id, nome: m.nome })}
                    >
                      Remover modelo
                    </Botao>
                  ) : (
                    <Botao
                      tamanho="sm"
                      disabled={somenteLeitura || aplicandoModelo}
                      onClick={() => setModeloEscolhido(m)}
                    >
                      Adotar modelo
                    </Botao>
                  )}
                </div>
              </Cartao>
            );
          })}
        </div>
      )}

      {obrigatoriasSemModelo.length > 0 && (
        <p className="text-sm text-gray-500">
          Já inclusas obrigatoriamente, sem depender de nenhum modelo:{' '}
          {obrigatoriasSemModelo.map((l) => l.produto.nome).join(', ')}.
        </p>
      )}

      <Cartao className="flex-row flex-wrap items-center gap-5 p-4">
        <div className="flex flex-col">
          <span className="text-xs tracking-wide text-gray-500 uppercase">
            Avaliações em larga escala
          </span>
          <span className="font-mono text-base font-semibold text-brand tabular-nums">
            {formatarBRL(totalAdotado)}
          </span>
        </div>

        <div className="flex-1" />

        <Botao variante="secundario" onClick={aoVoltar}>
          Voltar
        </Botao>
        <Botao onClick={aoAvancar}>Continuar para soluções adicionais</Botao>
      </Cartao>

      <Modal
        aberto={!!modeloVisualizando}
        aoFechar={() => setModeloVisualizando(null)}
        titulo={modeloVisualizando?.nome ?? ''}
        descricao={modeloVisualizando?.descricao || 'Em quais anos escolares cada avaliação entra'}
        largura="xxl"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setModeloVisualizando(null)}>
              Fechar
            </Botao>
            {modeloVisualizando &&
              !linhas.some((l) => l.item?.origemModeloId === modeloVisualizando.id) && (
                <Botao
                  disabled={somenteLeitura}
                  onClick={() => {
                    setModeloEscolhido(modeloVisualizando);
                    setModeloVisualizando(null);
                  }}
                >
                  Adotar modelo
                </Botao>
              )}
          </>
        }
      >
        {resolucaoVisualizando && (
          <GradeModelo itens={resolucaoVisualizando.itens} colunas={colunas} />
        )}
        {resolucaoVisualizando?.indisponiveis.length ? (
          <p className="text-xs text-gray-500">
            Não disponíveis para a sua unidade, ficam de fora:{' '}
            {resolucaoVisualizando.indisponiveis.join(', ')}.
          </p>
        ) : null}
      </Modal>

      <DialogoConfirmacao
        aberto={!!modeloEscolhido}
        nivel={modeloSobrescreve ? 'medio' : 'simples'}
        titulo={`Adotar "${modeloEscolhido?.nome ?? ''}"`}
        descricao={
          modeloSobrescreve
            ? 'Alguma destas avaliações já tem decisão gravada — adotar o modelo substitui a decisão atual dela.'
            : 'O valor de cada avaliação é calculado sobre a previsão de alunos da sua unidade.'
        }
        detalhe={
          <div className="flex flex-col gap-2">
            {previaItens.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="pb-1 font-medium">Avaliação</th>
                      <th className="pb-1 pr-2 text-right font-medium">Licenças</th>
                      <th className="pb-1 text-right font-medium">Valor anual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previaItens.map((i) => (
                      <tr key={i.produto.id} className="border-t border-gray-200">
                        <td className="py-1.5 pr-2">
                          <span className="text-gray-700">{i.produto.nome}</span>
                          <span className="block text-xs text-gray-500">
                            {descreverAnos(i.anos)}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                          {i.alunos}
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {formatarBRL(i.valorAnual)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 font-semibold text-gray-800">
                      <td className="pt-1.5">Total do modelo</td>
                      <td />
                      <td className="pt-1.5 text-right font-mono tabular-nums">
                        {formatarBRL(previaTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <span className="text-gray-500">
                Nenhuma avaliação deste modelo está disponível para a sua unidade.
              </span>
            )}
            {resolucaoEscolhido && resolucaoEscolhido.indisponiveis.length > 0 && (
              <div className="flex flex-col gap-1 text-xs text-gray-500">
                <span>Não disponíveis para a sua unidade, ficam de fora:</span>
                <span>{resolucaoEscolhido.indisponiveis.join(', ')}</span>
              </div>
            )}
          </div>
        }
        textoConfirmar="Adotar modelo"
        carregando={aplicandoModelo}
        aoCancelar={() => setModeloEscolhido(null)}
        aoConfirmar={() => void aplicarModeloEscolhido()}
      />

      <DialogoConfirmacao
        aberto={!!modeloParaRemover}
        nivel="medio"
        titulo={`Remover "${modeloParaRemover?.nome ?? ''}"`}
        descricao="As avaliações que vieram deste modelo voltam a ficar sem decisão — inclusive as obrigatórias, que só recalculam o valor quando alguém adotar outro modelo ou o pedido for enviado. Depois de remover, você pode adotar outro modelo."
        detalhe={
          modeloParaRemover && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-gray-700">Ficam sem decisão:</span>
                <ul className="flex flex-col gap-0.5">
                  {produtosDoModelo(modeloParaRemover.id).map((produtoId) => (
                    <li key={produtoId}>
                      {linhas.find((l) => l.produto.id === produtoId)?.produto.nome ?? produtoId}
                    </li>
                  ))}
                </ul>
              </div>
              {/* Solução que só existe por causa deste modelo cai junto. Sem
                  este aviso ela sumiria da etapa 3 sem nenhuma relação
                  visível com o botão que acabou de ser clicado. */}
              {dependemDesteModelo(modeloParaRemover.id).length > 0 && (
                <div className="flex flex-col gap-1 text-amber-700">
                  <span className="font-medium">Também deixam de ficar disponíveis:</span>
                  <ul className="flex flex-col gap-0.5">
                    {dependemDesteModelo(modeloParaRemover.id).map((p) => (
                      <li key={p.id}>{p.nome}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        }
        textoConfirmar="Remover modelo"
        carregando={removendoModelo}
        aoCancelar={() => setModeloParaRemover(null)}
        aoConfirmar={() => void removerModeloEscolhido()}
      />
    </div>
  );
}

/**
 * Colunas = anos escolares que a unidade oferta; linhas = avaliações do
 * modelo. Marca quando a avaliação entra naquele ano — números só na hora
 * de adotar.
 */
function GradeModelo({
  itens,
  colunas,
}: {
  itens: readonly ItemParaAplicar[];
  colunas: readonly AnoEscolarId[];
}) {
  if (itens.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Nenhuma avaliação deste modelo está disponível para a sua unidade.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {/* max-height própria + overflow aqui (não só no wrapper do Modal) é o
          que permite o cabeçalho ficar sticky ao rolar — e com nome truncado
          numa linha só, em vez de três, a grade toda costuma caber sem rolar
          em telas de laptop pra cima. */}
      <div className="max-h-[65vh] overflow-auto rounded-lg border border-gray-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 w-44 border-b border-gray-200 bg-white px-3 py-2 text-left text-xs font-medium text-gray-500 sm:w-56">
                Avaliação
              </th>
              {colunas.map((ano) => (
                <th
                  key={ano}
                  className="sticky top-0 z-10 min-w-9 border-b border-gray-200 bg-gray-100 px-1 py-2 text-center text-xs font-medium text-gray-600"
                >
                  {anoEscolar(ano).curto}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map(({ produto, habilitacao, decisao }) => {
              const anos = new Set(anosEfetivos(habilitacao, decisao.anos));
              return (
                <tr key={produto.id} className="border-t border-gray-200">
                  <td className="sticky left-0 z-10 w-44 bg-white px-3 py-1.5 sm:w-56">
                    <span className="block truncate text-gray-700" title={produto.nome}>
                      {produto.nome}
                    </span>
                  </td>
                  {colunas.map((ano) => (
                    <td key={ano} className="px-1 py-1.5 text-center">
                      {anos.has(ano) && (
                        <span
                          aria-hidden="true"
                          className={juntar('mx-auto block h-2.5 w-2.5 rounded-full bg-brand-medium')}
                        />
                      )}
                      <span className="sr-only">
                        {anos.has(ano) ? `${produto.nome} entra em ${ano}` : `${produto.nome} não entra em ${ano}`}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {colunas.length > 6 && (
        <p className="text-xs text-gray-400 sm:hidden">
          Arraste a tabela para o lado para ver todos os anos escolares.
        </p>
      )}
    </div>
  );
}
