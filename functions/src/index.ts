/**
 * Superfície de escrita do sistema. Tudo que muda estado sensível — sessão,
 * pedido, papel — entra por uma destas funções, porque as regras do
 * Firestore negam a escrita direta correspondente.
 */
export { gerarConvite, revogarConvite, resgatarConvite } from './convites';
export { iniciarPedido, enviarPedido, decidirPedido } from './pedidos';
export { definirPapel, desativarUsuario } from './usuarios';
