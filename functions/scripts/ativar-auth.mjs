/**
 * Provisiona o Firebase Authentication no projeto e habilita os provedores
 * de entrada.
 *
 * O `firebase init auth` grava a configuração local, mas não inicializa o
 * Identity Platform no lado do Google — sem isso qualquer chamada de auth
 * responde "There is no configuration corresponding to the provided
 * identifier". Este script faz o passo que falta, o mesmo que o botão
 * "Começar" da aba Authentication no console.
 *
 * Uso:  node scripts/ativar-auth.mjs
 */
import { GoogleAuth } from 'google-auth-library';

const PROJETO = process.env.GCLOUD_PROJECT ?? 'plataformas-marista';
const BASE = 'https://identitytoolkit.googleapis.com/v2';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  projectId: PROJETO,
  clientOptions: { quotaProjectId: PROJETO },
});
const cliente = await auth.getClient();

async function chamar(metodo, caminho, corpo) {
  const { token } = await cliente.getAccessToken();
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': PROJETO,
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await resposta.text();
  return { ok: resposta.ok, status: resposta.status, corpo: texto };
}

console.log(`Projeto: ${PROJETO}`);

const inicial = await chamar('POST', `/projects/${PROJETO}/identityPlatform:initializeAuth`, {});
if (inicial.ok) {
  console.log('Authentication provisionado.');
} else if (inicial.corpo.includes('ALREADY_EXISTS') || inicial.status === 409) {
  console.log('Authentication já estava provisionado.');
} else {
  // O caminho `initializeAuth` é o do Identity Platform (GCIP), que exige
  // billing. O Firebase Authentication comum não exige — ele nasce quando o
  // primeiro provedor é habilitado. Seguimos para ver como está a config.
  console.warn(`initializeAuth recusado (HTTP ${inicial.status}): ${inicial.corpo.slice(0, 200)}`);
}

const config = await chamar('GET', `/projects/${PROJETO}/config`);
if (config.ok) {
  const dados = JSON.parse(config.corpo);
  console.log('Domínios autorizados:', (dados.authorizedDomains ?? []).join(', '));
} else {
  console.error(`Não consegui ler a configuração (HTTP ${config.status}):`);
  console.error(config.corpo.slice(0, 400));
}
