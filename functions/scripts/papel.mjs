/**
 * Define papel e vínculo de um usuário, direto pelo Admin SDK.
 *
 * Existe porque a function `definirPapel` só sobe com o plano Blaze, e
 * alguém precisa ser admin antes de qualquer outra coisa — o primeiro
 * administrador não tem quem o promova. Depois do Blaze, prefira a
 * function: ela valida vínculo e registra quem promoveu quem.
 *
 * Credencial: Application Default Credentials da sua conta Google
 * (a mesma do Firebase CLI). Nenhuma chave de serviço é criada nem salva.
 *
 * Uso:
 *   node scripts/papel.mjs listar
 *   node scripts/papel.mjs definir <email> admin
 *   node scripts/papel.mjs definir <email> gestor_regional <regionalId>
 *   node scripts/papel.mjs definir <email> gestor_unidade <regionalId> <unidadeId>
 *   node scripts/papel.mjs convidar <email> gestor_unidade <regionalId> <unidadeId>
 *   node scripts/papel.mjs limpar <email>
 *
 * `convidar` faz o mesmo que `definir` e ainda devolve um link para a pessoa
 * escolher a própria senha — útil para montar contas de teste de cada papel.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROJETO = process.env.GCLOUD_PROJECT ?? 'plataformas-marista';
const PAPEIS = ['admin', 'gestor_regional', 'gestor_unidade', 'leitura'];

// Credencial de usuário (ADC) não carrega projeto de cobrança embutido, e a
// API de identidade exige um. Sem isto, toda chamada volta 403 pedindo o
// "quota project" — que é este mesmo projeto.
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJETO;

initializeApp({ credential: applicationDefault(), projectId: PROJETO });
const auth = getAuth();

const [comando, ...args] = process.argv.slice(2);

async function acharOuCriar(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch {
    console.log(`  (usuário não existia — criando cadastro para ${email})`);
    return auth.createUser({ email });
  }
}

async function listar() {
  const { users } = await auth.listUsers(100);
  if (users.length === 0) {
    console.log('Nenhum usuário no Firebase Auth ainda.');
    return;
  }
  console.log(`${users.length} usuário(s):`);
  for (const u of users) {
    const claims = u.customClaims ?? {};
    const papel = claims.papel ?? '(sem papel — não passa nas regras)';
    const vinculo = [claims.regionalId, claims.unidadeId].filter(Boolean).join(' / ');
    console.log(`  ${u.email ?? u.uid}  →  ${papel}${vinculo ? `  [${vinculo}]` : ''}`);
    console.log(`     uid: ${u.uid}  provedores: ${u.providerData.map((p) => p.providerId).join(', ') || 'nenhum'}`);
  }
}

async function definir([email, papel, regionalId, unidadeId]) {
  if (!email || !PAPEIS.includes(papel)) {
    throw new Error(`Uso: definir <email> <${PAPEIS.join('|')}> [regionalId] [unidadeId]`);
  }
  if (papel === 'gestor_regional' && !regionalId) throw new Error('gestor_regional exige regionalId.');
  if (papel === 'gestor_unidade' && (!regionalId || !unidadeId)) {
    throw new Error('gestor_unidade exige regionalId e unidadeId.');
  }

  const usuario = await acharOuCriar(email);
  const claims = { papel };
  if (regionalId) claims.regionalId = regionalId;
  if (unidadeId) claims.unidadeId = unidadeId;

  await auth.setCustomUserClaims(usuario.uid, claims);
  // Sem isto, o token atual continua valendo com os claims antigos até
  // expirar — até uma hora de acesso que já deveria ter mudado.
  await auth.revokeRefreshTokens(usuario.uid);

  console.log(`OK: ${email} agora é ${papel}${regionalId ? ` em ${regionalId}` : ''}`);
  console.log(`    uid ${usuario.uid}`);
  console.log('    Se já estiver logado, saia e entre de novo para o token pegar o papel novo.');
}

/**
 * Cria a conta e devolve um link para a própria pessoa definir a senha.
 *
 * Ninguém escolhe senha pelos outros e ninguém transmite senha por mensagem:
 * quem vai usar a conta é quem define, e o link vale uma vez.
 */
async function convidar([email, papel, regionalId, unidadeId]) {
  await definir([email, papel, regionalId, unidadeId]);
  const link = await auth.generatePasswordResetLink(email);
  console.log('');
  console.log('Link para definir a senha (uso único, expira em algumas horas):');
  console.log(link);
}

async function limpar([email]) {
  if (!email) throw new Error('Uso: limpar <email>');
  const usuario = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(usuario.uid, {});
  await auth.revokeRefreshTokens(usuario.uid);
  console.log(`OK: ${email} ficou sem papel — o próximo token não passa nas regras.`);
}

const comandos = { listar, definir, convidar, limpar };

if (!comandos[comando]) {
  console.error('Comandos: listar | definir | convidar | limpar');
  process.exit(1);
}

comandos[comando](args)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Erro:', e.message ?? e);
    process.exit(1);
  });
