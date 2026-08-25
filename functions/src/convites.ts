import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { Convite, Unidade } from '../../dominio/tipos';
import { OPCOES_PADRAO, admin, agora, db, exigirPapel, exigirTexto, limitarTentativas } from './comum';

/**
 * Links de acesso.
 *
 * O token em claro existe em dois momentos: na resposta de `gerarConvite`,
 * que vai para quem vai enviar o link, e no clique de quem recebe. No banco
 * fica só o SHA-256 — vazamento da coleção não vira acesso a nada.
 *
 * O escopo (ciclo, unidade, papel) é fixado na criação. Não existe link
 * genérico em que a pessoa escolhe a unidade depois: é justamente essa
 * escolha que a segurança precisa impedir.
 */

const VALIDADE_PADRAO_DIAS = 7;
const VALIDADE_MAXIMA_DIAS = 60;

function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function comparacaoSegura(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function urlBase(): string {
  return process.env.URL_APP ?? 'https://plataformas-marista.web.app';
}

// ─── Gerar ───────────────────────────────────────────────────────

export const gerarConvite = onCall(OPCOES_PADRAO, async (req) => {
  const quem = exigirPapel(req, ['admin', 'gestor_regional']);

  const cicloId = exigirTexto(req.data?.cicloId, 'ciclo', 80);
  const unidadeId = exigirTexto(req.data?.unidadeId, 'unidade', 80);
  const email = req.data?.email ? exigirTexto(req.data.email, 'e-mail', 200).toLowerCase() : undefined;

  const dias = Number(req.data?.validadeDias ?? VALIDADE_PADRAO_DIAS);
  if (!Number.isInteger(dias) || dias < 1 || dias > VALIDADE_MAXIMA_DIAS) {
    throw new HttpsError('invalid-argument', `Validade deve estar entre 1 e ${VALIDADE_MAXIMA_DIAS} dias.`);
  }

  const unidadeDoc = await db.collection('unidades').doc(unidadeId).get();
  if (!unidadeDoc.exists) throw new HttpsError('not-found', 'Unidade não encontrada.');
  const unidade = unidadeDoc.data() as Unidade;

  // O gestor regional só gera link para unidades da própria regional.
  if (quem.papel === 'gestor_regional' && unidade.regionalId !== quem.regionalId) {
    throw new HttpsError('permission-denied', 'Esta unidade não pertence à sua regional.');
  }

  const ciclo = await db.collection('ciclos').doc(cicloId).get();
  if (!ciclo.exists) throw new HttpsError('not-found', 'Ciclo não encontrado.');

  const token = randomBytes(32).toString('base64url');
  const expiraEm = new Date(Date.now() + dias * 86400_000).toISOString();

  const convite: Omit<Convite, 'id'> = {
    tokenHash: hashDoToken(token),
    cicloId,
    unidadeId,
    regionalId: unidade.regionalId,
    papel: 'gestor_unidade',
    ...(email ? { email } : {}),
    criadoPor: quem.uid,
    criadoEm: agora(),
    expiraEm,
    usos: 0,
    usosMaximos: 1,
  };

  const ref = await db.collection('convites').add(convite);

  return {
    conviteId: ref.id,
    // Única vez em que o token trafega em claro. Quem gerou copia e envia
    // pelo canal que preferir.
    url: `${urlBase()}/entrar?convite=${token}`,
    expiraEm,
    unidadeNome: unidade.nome,
  };
});

// ─── Revogar ─────────────────────────────────────────────────────

export const revogarConvite = onCall(OPCOES_PADRAO, async (req) => {
  const quem = exigirPapel(req, ['admin', 'gestor_regional']);
  const conviteId = exigirTexto(req.data?.conviteId, 'convite', 80);

  const ref = db.collection('convites').doc(conviteId);
  const doc = await ref.get();
  if (!doc.exists) throw new HttpsError('not-found', 'Link de acesso não encontrado.');

  const convite = doc.data() as Convite;
  if (quem.papel === 'gestor_regional' && convite.regionalId !== quem.regionalId) {
    throw new HttpsError('permission-denied', 'Este link não pertence à sua regional.');
  }

  await ref.update({ revogadoEm: agora(), revogadoPor: quem.uid });
  return { ok: true };
});

// ─── Resgatar ────────────────────────────────────────────────────

/**
 * Chamada SEM autenticação — é o ponto de entrada de quem ainda não tem
 * sessão. Por isso é o trecho mais defensivo do sistema:
 *   · limite de tentativas por IP antes de qualquer consulta
 *   · resposta idêntica para token inexistente, expirado, revogado ou já
 *     usado (distinguir os casos é dar pista a quem testa links no escuro)
 *   · o custom token sai com o escopo do convite, não com o que o cliente pediu
 */
export const resgatarConvite = onCall({ ...OPCOES_PADRAO, maxInstances: 20 }, async (req) => {
  const ip = req.rawRequest.ip ?? 'desconhecido';
  await limitarTentativas(`convite_ip_${createHash('sha256').update(ip).digest('hex')}`, 10, 600);

  const token = exigirTexto(req.data?.token, 'token', 200);
  const recusar = () => new HttpsError('permission-denied', 'Link de acesso inválido ou expirado.');

  const achados = await db
    .collection('convites')
    .where('tokenHash', '==', hashDoToken(token))
    .limit(1)
    .get();

  if (achados.empty) throw recusar();

  const doc = achados.docs[0];
  if (!doc) throw recusar();
  const convite = doc.data() as Convite;

  // Confirmação em tempo constante, mesmo com o índice já tendo casado.
  if (!comparacaoSegura(convite.tokenHash, hashDoToken(token))) throw recusar();
  if (convite.revogadoEm) throw recusar();
  if (new Date(convite.expiraEm).getTime() < Date.now()) throw recusar();
  if (convite.usos >= convite.usosMaximos) throw recusar();

  // Identidade: o e-mail do convite, quando houver; senão, uma conta por
  // unidade — a regra do produto é "uma unidade, um gestor indicado".
  const uidDaUnidade = `unidade_${convite.unidadeId}`;
  let uid = uidDaUnidade;

  if (convite.email) {
    try {
      const existente = await admin.getUserByEmail(convite.email);
      uid = existente.uid;
    } catch {
      const criado = await admin.createUser({ email: convite.email, emailVerified: false });
      uid = criado.uid;
    }
  } else {
    try {
      await admin.getUser(uid);
    } catch {
      await admin.createUser({ uid });
    }
  }

  const claims = {
    papel: convite.papel,
    unidadeId: convite.unidadeId,
    regionalId: convite.regionalId,
  };
  await admin.setCustomUserClaims(uid, claims);

  await db
    .collection('usuarios')
    .doc(uid)
    .set(
      {
        email: convite.email ?? '',
        papel: convite.papel,
        unidadeId: convite.unidadeId,
        regionalId: convite.regionalId,
        origemAuth: 'link',
        ativo: true,
        ultimoAcessoEm: agora(),
      },
      { merge: true },
    );

  await doc.ref.update({
    usos: convite.usos + 1,
    ultimoUso: {
      em: agora(),
      ip,
      agente: String(req.rawRequest.headers['user-agent'] ?? '').slice(0, 300),
    },
  });

  const customToken = await admin.createCustomToken(uid, claims);
  return { customToken };
});
