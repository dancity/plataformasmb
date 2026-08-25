import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { Papel } from '../../dominio/tipos';
import { OPCOES_PADRAO, admin, agora, db, exigirPapel, exigirTexto } from './comum';

/**
 * Papel e vínculo só mudam aqui. É a única porta que escreve custom claims,
 * e claims são o que as regras do Firestore leem para decidir tudo — por
 * isso a coleção `usuarios` é somente leitura para o cliente.
 */

const PAPEIS: readonly Papel[] = ['admin', 'gestor_regional', 'gestor_unidade', 'leitura'];

export const definirPapel = onCall(OPCOES_PADRAO, async (req) => {
  const quem = exigirPapel(req, ['admin']);

  const email = exigirTexto(req.data?.email, 'e-mail', 200).toLowerCase();
  const papel = req.data?.papel as Papel;
  if (!PAPEIS.includes(papel)) throw new HttpsError('invalid-argument', 'Perfil inválido.');

  const unidadeId = req.data?.unidadeId ? exigirTexto(req.data.unidadeId, 'unidade', 80) : undefined;
  const regionalId = req.data?.regionalId
    ? exigirTexto(req.data.regionalId, 'regional', 80)
    : undefined;

  // Vínculo coerente com o papel: gestor sem unidade não consegue fazer
  // nada, e gestor regional sem regional enxergaria a rede inteira.
  if (papel === 'gestor_unidade' && (!unidadeId || !regionalId)) {
    throw new HttpsError('invalid-argument', 'Gestor de unidade precisa de unidade e regional.');
  }
  if (papel === 'gestor_regional' && !regionalId) {
    throw new HttpsError('invalid-argument', 'Gestor regional precisa de uma regional.');
  }

  if (unidadeId) {
    const unidade = await db.collection('unidades').doc(unidadeId).get();
    if (!unidade.exists) throw new HttpsError('not-found', 'Unidade não encontrada.');
    if (unidade.get('regionalId') !== regionalId) {
      throw new HttpsError('invalid-argument', 'Esta unidade não pertence à regional informada.');
    }
  }

  let uid: string;
  let nome = typeof req.data?.nome === 'string' ? req.data.nome.slice(0, 200) : '';
  try {
    const usuario = await admin.getUserByEmail(email);
    uid = usuario.uid;
    nome = nome || usuario.displayName || '';
  } catch {
    // Cadastrar antes do primeiro acesso é o caso normal: a pessoa entra
    // depois, por SSO ou link, e já cai no vínculo certo.
    const criado = await admin.createUser({ email, displayName: nome || undefined });
    uid = criado.uid;
  }

  const claims: Record<string, string> = { papel };
  if (unidadeId) claims.unidadeId = unidadeId;
  if (regionalId) claims.regionalId = regionalId;
  await admin.setCustomUserClaims(uid, claims);

  await db
    .collection('usuarios')
    .doc(uid)
    .set(
      {
        nome,
        email,
        papel,
        ...(unidadeId ? { unidadeId } : {}),
        ...(regionalId ? { regionalId } : {}),
        origemAuth: 'microsoft',
        ativo: true,
        criadoEm: agora(),
        definidoPor: quem.uid,
      },
      { merge: true },
    );

  return { uid, papel };
});

/**
 * Corta o acesso sem apagar histórico: limpa os claims (o token seguinte já
 * não passa nas regras) e marca o cadastro como inativo. Apagar o usuário
 * quebraria a trilha, que precisa continuar dizendo quem fez o quê.
 */
export const desativarUsuario = onCall(OPCOES_PADRAO, async (req) => {
  exigirPapel(req, ['admin']);
  const uid = exigirTexto(req.data?.uid, 'usuário', 128);

  await admin.setCustomUserClaims(uid, {});
  await admin.revokeRefreshTokens(uid);
  await db.collection('usuarios').doc(uid).set({ ativo: false }, { merge: true });

  return { ok: true };
});
