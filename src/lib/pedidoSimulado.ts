import type { Dispatch, SetStateAction } from 'react';
import type { Ciclo, ItemPedido, Pedido } from '@dominio/tipos';
import {
  calcularLinhas,
  computarItem,
  idPedido,
  limparPrevisao,
  somarTotais,
} from './pedido';
import type { ContextoPedido, EscritorPedido, Totais } from './pedido';
import type { Sessao } from './auth';

/** O rascunho vazio que `abrirRascunho` e `aplicarModelo` criam, na simulação
 * — mesmo formato do documento real, só que nunca sai da memória. */
function criarPedidoVazio(ciclo: Ciclo, sessao: Sessao, id: string): Pedido {
  return {
    id,
    cicloId: ciclo.id,
    unidadeId: sessao.unidadeId!,
    regionalId: sessao.regionalId!,
    solicitante: { uid: sessao.uid, nome: sessao.nome, email: sessao.email },
    estado: 'rascunho',
    versao: 1,
    totais: { obrigatorio: 0, opcional: 0, total: 0 },
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
}

/**
 * Escritor que nunca toca o Firestore nem chama Cloud Function: todo "salvar"
 * só atualiza o `ContextoPedido` em memória, via o mesmo `setCtx` que o
 * `FluxoPedido` já usa. É o que deixa o admin caminhar pela tela do gestor —
 * escolher regional, preencher previsão, marcar soluções, "enviar" — sem
 * gravar nada em nome de uma unidade que não é dele. Sair da simulação e
 * tudo evapora; recarregar a página começa do zero de novo.
 *
 * A conta em si (computarItem, calcularLinhas, somarTotais) é a mesma do
 * caminho real — só o destino da escrita muda.
 */
export function criarEscritorSimulado(
  setCtx: Dispatch<SetStateAction<ContextoPedido | null>>,
): EscritorPedido {
  return {
    async salvarPrevisao(_ciclo, _sessao, porAno, confirmar) {
      const previsao = limparPrevisao(porAno);
      setCtx((c) => c && { ...c, previsao, previsaoConfirmada: confirmar || c.previsaoConfirmada });
    },

    async abrirRascunho(ciclo, sessao) {
      const id = idPedido(ciclo.id, sessao.unidadeId!);
      setCtx((c) => (!c || c.pedido ? c : { ...c, pedido: criarPedidoVazio(ciclo, sessao, id) }));
      return id;
    },

    async salvarDecisao(_pedidoId, produto, habilitacao, fornecedorNome, previsao, decisao) {
      const item = computarItem(produto, habilitacao, fornecedorNome, previsao, decisao);
      setCtx((c) => {
        if (!c) return c;
        const itens = new Map(c.itens);
        itens.set(produto.id, item);
        return { ...c, itens };
      });
      return item;
    },

    async aplicarModelo(ciclo, sessao, itens) {
      const id = idPedido(ciclo.id, sessao.unidadeId!);
      let resultado: ItemPedido[] = [];
      setCtx((c) => {
        if (!c) return c;
        const novosItens = new Map(c.itens);
        resultado = itens.map(({ produto, habilitacao, fornecedorNome, previsao, decisao }) => {
          const item = computarItem(produto, habilitacao, fornecedorNome, previsao, decisao);
          novosItens.set(produto.id, item);
          return item;
        });
        return { ...c, itens: novosItens, pedido: c.pedido ?? criarPedidoVazio(ciclo, sessao, id) };
      });
      return resultado;
    },

    async enviarPedido(_cicloId) {
      let totais: Totais = { obrigatorio: 0, opcional: 0, total: 0 };
      setCtx((c) => {
        if (!c || !c.pedido) return c;
        totais = somarTotais(calcularLinhas(c, c.pedido.regionalId));
        return {
          ...c,
          pedido: { ...c.pedido, estado: 'enviado', totais, atualizadoEm: new Date().toISOString() },
        };
      });
      return { totais };
    },
  };
}
