/**
 * Confere a matemática do catálogo real contra o cenário do plano.
 *
 * Lê produtos, regras e previsão direto do Firestore e roda as MESMAS funções
 * de domínio que o app e a Cloud Function usam. Se um preço estiver errado no
 * cadastro, ou uma regra de habilitação faltando, o total não fecha e o script
 * falha — sem precisar abrir o navegador nem clicar em nada.
 *
 * Pré-requisito: npm run build (usa dominio compilado em lib/).
 *
 * Uso: node scripts/conferir-totais.mjs
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverHabilitacao, anosEfetivos } from '../lib/dominio/habilitacao.js';
import { calcularItem, formatarBRL } from '../lib/dominio/preco.js';

const PROJETO = process.env.GCLOUD_PROJECT ?? 'plataformas-marista';
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJETO;
initializeApp({ credential: applicationDefault(), projectId: PROJETO });
const db = getFirestore();

const CICLO = 'c2027';
const UNIDADE = 'boa-viagem';
const REGIONAL = 'recife';

/** O que o gestor do plano escolheria, entre as opcionais. */
const ESCOLHAS = {
  robotica: ['EF1', 'EF2', 'EF3', 'EF4', 'EF5'],
  'simulado-enem': ['EF9', 'EM1', 'EM2', 'EM3'],
  'laboratorio-virtual': ['EF1', 'EF2', 'EF3', 'EF4', 'EF5', 'EF6', 'EF7', 'EF8', 'EF9', 'EM1', 'EM2', 'EM3'],
  'plataforma-leitura': [], // não contratada
};

const ESPERADO = {
  'avaliacao-diagnostica': 4_080_000,
  socioemocional: 1_430_000,
  robotica: 6_600_000,
  'simulado-enem': 2_700_000,
  'laboratorio-virtual': 1_440_000,
  'plataforma-leitura': 0,
};
const TOTAL_ESPERADO = 16_250_000; // R$ 162.500,00

const [matriculaDoc, produtosSnap, regrasSnap] = await Promise.all([
  db.collection('matriculas').doc(`${CICLO}_${UNIDADE}`).get(),
  db.collection('produtos').where('cicloId', '==', CICLO).where('visibilidade', '==', 'publicado').get(),
  db.collectionGroup('regras').where('regionalId', '==', REGIONAL).get(),
]);

if (!matriculaDoc.exists) {
  console.error('Previsão de alunos não encontrada. Rode scripts/semear.mjs antes.');
  process.exit(1);
}

const previsao = matriculaDoc.data().porAno;
const produtos = produtosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const regras = regrasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

console.log(`Unidade fictícia · ${Object.values(previsao).reduce((a, b) => a + b, 0)} alunos\n`);

let total = 0;
let falhas = 0;

for (const produto of produtos.sort((a, b) => a.ordem - b.ordem)) {
  const hab = resolverHabilitacao(produto, regras, REGIONAL, previsao);
  if (!hab.disponivel) {
    console.log(`  ${produto.nome}: indisponível nesta regional`);
    continue;
  }

  const anos = anosEfetivos(hab, ESCOLHAS[produto.id] ?? []);
  const { alunos, valorAnual } = calcularItem(hab.preco, previsao, anos);
  total += valorAnual;

  const esperado = ESPERADO[produto.id];
  const bate = esperado === undefined || esperado === valorAnual;
  if (!bate) falhas++;

  const tipo = hab.obrigatorios.length > 0 ? 'obrigatória' : 'opcional';
  console.log(
    `  ${bate ? 'ok ' : 'ERRO'} ${produto.nome.padEnd(34)} ${tipo.padEnd(12)}` +
      `${String(alunos).padStart(5)} alunos  ${formatarBRL(valorAnual).padStart(16)}` +
      (bate ? '' : `   esperado ${formatarBRL(esperado)}`),
  );
}

console.log(`\n  TOTAL${' '.repeat(52)}${formatarBRL(total).padStart(16)}`);
console.log(`  esperado${' '.repeat(49)}${formatarBRL(TOTAL_ESPERADO).padStart(16)}`);

if (total !== TOTAL_ESPERADO || falhas > 0) {
  console.error(`\nFALHOU: ${falhas} solução(ões) fora do esperado.`);
  process.exit(1);
}
console.log('\nTudo confere: catálogo, regras de habilitação e cálculo batem com o plano.');
process.exit(0);
