import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { AnoEscolarId, PrevisaoPorAno } from '../../dominio/anosEscolares';
import { aplicarLicencas } from '../../dominio/anosEscolares';
import { calcularItem } from '../../dominio/preco';
import { anosEfetivos, resolverHabilitacao } from '../../dominio/habilitacao';
import type {
  Ciclo,
  EventoPedido,
  Fornecedor,
  ItemPedido,
  Matricula,
  Pedido,
  Produto,
  RegraHabilitacao,
  TotaisPedido,
  Unidade,
} from '../../dominio/tipos';
import { OPCOES_PADRAO, agora, db, exigirPapel, exigirTexto } from './comum';

/**
 * Todo o ciclo de vida do pedido passa por aqui. As regras do Firestore
 * negam escrita direta no documento do pedido — de propósito:
 *
 *   · o total é recalculado no servidor, com o preço do catálogo e a
 *     previsão de alunos gravada, não com o que o cliente mandou;
 *   · o preço é congelado no item no momento do envio, para que uma
 *     correção de catálogo em outubro não mude um pedido já aprovado;
 *   · a transição de estado é validada contra a máquina de estados, então
 *     enviar duas vezes não duplica nada.
 */

function idDoPedido(cicloId: string, unidadeId: string): string {
  return `${cicloId}_${unidadeId}`;
}

async function carregarCicloAberto(cicloId: string): Promise<Ciclo> {
  const doc = await db.collection('ciclos').doc(cicloId).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Ciclo não encontrado.');
  const ciclo = { id: doc.id, ...doc.data() } as Ciclo;
  if (ciclo.estado !== 'aberto') {
    throw new HttpsError('failed-precondition', 'Este ciclo não está aberto para envio.');
  }
  return ciclo;
}

// ─── Iniciar ─────────────────────────────────────────────────────

export const iniciarPedido = onCall(OPCOES_PADRAO, async (req) => {
  const quem = exigirPapel(req, ['gestor_unidade']);
  const cicloId = exigirTexto(req.data?.cicloId, 'ciclo', 80);
  await carregarCicloAberto(cicloId);

  if (!quem.unidadeId || !quem.regionalId) {
    throw new HttpsError('failed-precondition', 'Sua conta não está vinculada a uma unidade.');
  }

  const unidadeDoc = await db.collection('unidades').doc(quem.unidadeId).get();
  if (!unidadeDoc.exists) throw new HttpsError('not-found', 'Unidade não encontrada.');
  const unidade = unidadeDoc.data() as Unidade;

  const id = idDoPedido(cicloId, quem.unidadeId);
  const ref = db.collection('pedidos').doc(id);

  await db.runTransaction(async (tx) => {
    const existente = await tx.get(ref);
    if (existente.exists) return; // idempotente: abrir de novo não recria

    const novo: Omit<Pedido, 'id'> = {
      cicloId,
      unidadeId: quem.unidadeId!,
      regionalId: unidade.regionalId,
      solicitante: { uid: quem.uid, nome: quem.nome, email: quem.email },
      estado: 'rascunho',
      versao: 1,
      totais: { obrigatorio: 0, opcional: 0, total: 0 },
      criadoEm: agora(),
      atualizadoEm: agora(),
    };
    tx.set(ref, novo);

    const evento: Omit<EventoPedido, 'id'> = {
      tipo: 'criado',
      autor: { uid: quem.uid, nome: quem.nome, papel: quem.papel },
      em: agora(),
      versao: 1,
    };
    tx.set(ref.collection('eventos').doc(), evento);
  });

  return { pedidoId: id };
});

// ─── Enviar ──────────────────────────────────────────────────────

export const enviarPedido = onCall(OPCOES_PADRAO, async (req) => {
  const quem = exigirPapel(req, ['gestor_unidade']);
  const cicloId = exigirTexto(req.data?.cicloId, 'ciclo', 80);

  if (!quem.unidadeId || !quem.regionalId) {
    throw new HttpsError('failed-precondition', 'Sua conta não está vinculada a uma unidade.');
  }

  const ciclo = await carregarCicloAberto(cicloId);
  if (new Date(ciclo.prazoGestor).getTime() < Date.now()) {
    throw new HttpsError(
      'failed-precondition',
      'O prazo de envio deste ciclo encerrou. Fale com a sua regional.',
    );
  }

  const pedidoRef = db.collection('pedidos').doc(idDoPedido(cicloId, quem.unidadeId));
  const pedidoDoc = await pedidoRef.get();
  if (!pedidoDoc.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');

  const pedido = pedidoDoc.data() as Pedido;
  if (pedido.unidadeId !== quem.unidadeId) {
    throw new HttpsError('permission-denied', 'Este pedido não é da sua unidade.');
  }
  if (pedido.estado !== 'rascunho' && pedido.estado !== 'devolvido') {
    throw new HttpsError('failed-precondition', 'Este pedido já foi enviado.');
  }

  // ── Fonte da verdade: previsão e catálogo, lidos aqui, não recebidos ──
  const matriculaDoc = await db
    .collection('matriculas')
    .doc(`${cicloId}_${quem.unidadeId}`)
    .get();
  if (!matriculaDoc.exists) {
    throw new HttpsError('failed-precondition', 'Confirme a previsão de alunos antes de enviar.');
  }
  const previsao = (matriculaDoc.data() as Matricula).porAno;

  const [produtosSnap, regrasSnap, fornecedoresSnap, itensSnap] = await Promise.all([
    db
      .collection('produtos')
      .where('cicloId', '==', cicloId)
      .where('visibilidade', '==', 'publicado')
      .get(),
    db.collectionGroup('regras').where('regionalId', '==', quem.regionalId).get(),
    db.collection('fornecedores').get(),
    pedidoRef.collection('itens').get(),
  ]);

  const produtos = produtosSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Produto);
  const regras = regrasSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegraHabilitacao);
  const nomeFornecedor = new Map(
    fornecedoresSnap.docs.map((d) => [d.id, (d.data() as Fornecedor).nome]),
  );

  // O que o gestor marcou. Vale como intenção; o que é permitido quem
  // decide são as regras de habilitação, aqui no servidor.
  const escolhas = new Map<
    string,
    {
      anos: AnoEscolarId[];
      recusado: boolean;
      creditosPorAno?: PrevisaoPorAno;
      licencasPorAno?: PrevisaoPorAno;
    }
  >();
  for (const doc of itensSnap.docs) {
    const item = doc.data() as ItemPedido;
    escolhas.set(doc.id, {
      anos: Array.isArray(item.anosSelecionados) ? item.anosSelecionados : [],
      recusado: item.origem === 'recusado',
      // Múltiplo de crédito escolhido em cada ano — validado abaixo contra
      // as opções do catálogo, ano a ano.
      creditosPorAno:
        item.creditosPorAno && typeof item.creditosPorAno === 'object'
          ? item.creditosPorAno
          : undefined,
      // Proposta de licenças ajustadas manualmente — vale como intenção;
      // aplicarLicencas descarta qualquer valor que não seja um inteiro
      // não negativo, então não há o que validar além disso aqui.
      licencasPorAno:
        item.alunosPorAno && typeof item.alunosPorAno === 'object' ? item.alunosPorAno : undefined,
    });
  }

  const lote = db.batch();
  const totais: TotaisPedido = { obrigatorio: 0, opcional: 0, total: 0 };
  const pendentes: string[] = [];

  for (const produto of produtos) {
    const hab = resolverHabilitacao(produto, regras, quem.regionalId, previsao);
    if (!hab.disponivel) continue;

    const escolha = escolhas.get(produto.id);
    const decidiu = !!escolha && (escolha.recusado || escolha.anos.length > 0);
    const temObrigatorio = hab.obrigatorios.length > 0;

    if (!decidiu && !temObrigatorio) {
      pendentes.push(produto.nome);
      continue;
    }

    const anos = escolha?.recusado
      ? hab.obrigatorios // recusar não desmarca o que é obrigatório
      : anosEfetivos(hab, escolha?.anos ?? []);

    const itemRef = pedidoRef.collection('itens').doc(produto.id);

    if (anos.length === 0) {
      const recusado: Omit<ItemPedido, 'id'> = {
        produtoId: produto.id,
        produtoNome: produto.nome,
        fornecedorNome: nomeFornecedor.get(produto.fornecedorId) ?? '',
        categoria: produto.categoria,
        anosSelecionados: [],
        alunosPorAno: {},
        alunosTotal: 0,
        precoSnapshot: hab.preco,
        valorAnual: 0,
        origem: 'recusado',
        decisao: 'pendente',
        atualizadoEm: agora(),
      };
      lote.set(itemRef, recusado);
      continue;
    }

    // Crédito exige que o gestor tenha escolhido, para CADA ano marcado, um
    // dos múltiplos que o catálogo oferece — o mesmo serviço pode gastar
    // créditos diferentes por ano, então não basta um número só para a
    // solução inteira, e o que o cliente mandou não vale sem bater com a
    // lista do catálogo, ano a ano.
    let creditosPorAno: PrevisaoPorAno | undefined;
    if (hab.preco.base === 'credito') {
      const opcoes = hab.preco.opcoesCredito ?? [];
      const escolhidos: PrevisaoPorAno = {};
      const faltaAlgumAno = anos.some((ano) => {
        const escolhido = escolha?.creditosPorAno?.[ano];
        if (typeof escolhido !== 'number' || !opcoes.includes(escolhido)) return true;
        escolhidos[ano] = escolhido;
        return false;
      });
      if (faltaAlgumAno) {
        pendentes.push(produto.nome);
        continue;
      }
      creditosPorAno = escolhidos;
    }

    const previsaoEfetiva = aplicarLicencas(previsao, escolha?.licencasPorAno, anos);
    const { alunos, valorAnual } = calcularItem(hab.preco, previsaoEfetiva, anos, creditosPorAno);
    const alunosPorAno: Record<string, number> = {};
    for (const ano of anos) alunosPorAno[ano] = previsaoEfetiva[ano] ?? 0;

    const ehObrigatorio = hab.obrigatorios.length > 0;
    const item: Omit<ItemPedido, 'id'> = {
      produtoId: produto.id,
      produtoNome: produto.nome,
      fornecedorNome: nomeFornecedor.get(produto.fornecedorId) ?? '',
      categoria: produto.categoria,
      anosSelecionados: anos,
      alunosPorAno,
      alunosTotal: alunos,
      precoSnapshot: hab.preco,
      valorAnual,
      origem: ehObrigatorio ? 'obrigatorio' : 'escolha',
      decisao: 'pendente',
      atualizadoEm: agora(),
      ...(creditosPorAno ? { creditosPorAno } : {}),
    };
    lote.set(itemRef, item);

    if (ehObrigatorio) totais.obrigatorio += valorAnual;
    else totais.opcional += valorAnual;
  }

  if (pendentes.length > 0) {
    throw new HttpsError(
      'failed-precondition',
      `Faltam decisões: ${pendentes.join(', ')}. Marque os anos escolares ou escolha "não contratar".`,
    );
  }

  totais.total = totais.obrigatorio + totais.opcional;

  lote.update(pedidoRef, {
    estado: 'enviado',
    totais,
    enviadoEm: agora(),
    atualizadoEm: agora(),
    solicitante: { uid: quem.uid, nome: quem.nome, email: quem.email },
  });

  const evento: Omit<EventoPedido, 'id'> = {
    tipo: 'enviado',
    autor: { uid: quem.uid, nome: quem.nome, papel: quem.papel },
    em: agora(),
    versao: pedido.versao,
    snapshotTotais: totais,
  };
  lote.set(pedidoRef.collection('eventos').doc(), evento);

  await lote.commit();
  return { totais };
});

// ─── Decidir ─────────────────────────────────────────────────────

type Decisao = 'aprovado' | 'devolvido' | 'reprovado';

export const decidirPedido = onCall(OPCOES_PADRAO, async (req) => {
  const quem = exigirPapel(req, ['gestor_regional', 'admin']);
  const pedidoId = exigirTexto(req.data?.pedidoId, 'pedido', 200);
  const decisao = req.data?.decisao as Decisao;

  if (decisao !== 'aprovado' && decisao !== 'devolvido' && decisao !== 'reprovado') {
    throw new HttpsError('invalid-argument', 'Decisão inválida.');
  }

  // Devolver e reprovar exigem justificativa: decisão sem motivo registrado
  // vira telefonema, e o telefonema não fica na trilha.
  const comentario =
    decisao === 'aprovado'
      ? typeof req.data?.comentario === 'string'
        ? req.data.comentario.slice(0, 1000)
        : ''
      : exigirTexto(req.data?.comentario, 'motivo', 1000);

  const ref = db.collection('pedidos').doc(pedidoId);

  const resultado = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
    const pedido = doc.data() as Pedido;

    if (quem.papel === 'gestor_regional' && pedido.regionalId !== quem.regionalId) {
      throw new HttpsError('permission-denied', 'Este pedido não é da sua regional.');
    }
    if (pedido.estado !== 'enviado' && pedido.estado !== 'em_analise') {
      throw new HttpsError('failed-precondition', 'Este pedido não está aguardando decisão.');
    }

    // Devolver não decide nada: reabre para o gestor preservando tudo que
    // ele montou, com o comentário à vista, e sobe a versão.
    const novaVersao = decisao === 'devolvido' ? pedido.versao + 1 : pedido.versao;

    tx.update(ref, {
      estado: decisao,
      versao: novaVersao,
      decididoEm: agora(),
      decididoPor: quem.uid,
      comentarioDecisao: comentario,
      atualizadoEm: agora(),
      ...(decisao === 'aprovado' ? { 'totais.aprovado': pedido.totais.total } : {}),
    });

    const evento: Omit<EventoPedido, 'id'> = {
      tipo: decisao === 'devolvido' ? 'devolvido' : decisao,
      autor: { uid: quem.uid, nome: quem.nome, papel: quem.papel },
      em: agora(),
      comentario,
      versao: novaVersao,
      snapshotTotais: pedido.totais,
    };
    tx.set(ref.collection('eventos').doc(), evento);

    return { estado: decisao, versao: novaVersao };
  });

  return resultado;
});
