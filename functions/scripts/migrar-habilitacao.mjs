/**
 * Migra a habilitação de regional para nacional.
 *
 * Antes: `produtos/{id}/regras/{regionalId}_{ano}`, um documento por
 * combinação regional × ano. Agora: um mapa `habilitacao` no próprio produto,
 * porque obrigatoriedade e opcionalidade passaram a ser da rede inteira — a
 * regional aprova o pedido depois de preenchido, não configura catálogo.
 *
 * Colapso do que as regionais diziam, quando divergem: o MAIS INCLUSIVO ganha.
 *   alguma disse obrigatório            → obrigatório
 *   alguma disse opcional, nenhuma obr. → opcional
 *   nenhuma ofereceu                    → não oferecido
 * Errar para mais se corrige com um clique no cadastro; errar para menos tira
 * a solução da tela sem ninguém perceber.
 *
 * Uso:
 *   node scripts/migrar-habilitacao.mjs            # só relatório, não grava
 *   node scripts/migrar-habilitacao.mjs --gravar   # grava e apaga as regras
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJETO = process.env.GCLOUD_PROJECT ?? 'plataformas-marista';
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJETO;
initializeApp({ credential: applicationDefault(), projectId: PROJETO });
const db = getFirestore();

const GRAVAR = process.argv.includes('--gravar');
const FORCA = { obrigatorio: 2, opcional: 1 };

const produtos = await db.collection('produtos').get();
if (produtos.empty) {
  console.log('Nenhum produto. Nada a migrar.');
  process.exit(0);
}

let comRegras = 0;
let jaMigrados = 0;
const divergencias = [];
const planos = [];

for (const doc of produtos.docs) {
  const produto = doc.data();
  const regras = await doc.ref.collection('regras').get();

  if (regras.empty) {
    if (produto.habilitacao) jaMigrados++;
    else console.log(`  · ${produto.nome}: sem regras e sem habilitação — fica sem nenhum ano.`);
    continue;
  }
  comRegras++;

  // ano -> { estadoFinal, quem disse o quê }
  const porAno = new Map();
  const regionais = new Set();
  for (const r of regras.docs) {
    const { anoEscolar, obrigatoriedade, regionalId } = r.data();
    if (!anoEscolar || !FORCA[obrigatoriedade]) continue;
    regionais.add(regionalId);
    const atual = porAno.get(anoEscolar) ?? { vozes: new Map() };
    atual.vozes.set(regionalId, obrigatoriedade);
    porAno.set(anoEscolar, atual);
  }

  const habilitacao = {};
  const notas = [];
  for (const [ano, { vozes }] of porAno) {
    let vencedor = 'opcional';
    for (const v of vozes.values()) if (FORCA[v] > FORCA[vencedor]) vencedor = v;
    habilitacao[ano] = vencedor;

    const estados = new Set(vozes.values());
    const faltam = [...regionais].filter((r) => !vozes.has(r));
    if (estados.size > 1 || faltam.length > 0) {
      notas.push(
        `${ano} → ${vencedor}` +
          (estados.size > 1 ? ` (divergiam: ${[...estados].join('/')})` : '') +
          (faltam.length ? ` (não oferecido em ${faltam.join(', ')})` : ''),
      );
    }
  }

  const comOverride = regras.docs.filter((r) => r.data().precoOverride).length;
  if (comOverride) {
    notas.push(`${comOverride} regra(s) tinham precoOverride — campo nunca usado, será descartado`);
  }

  planos.push({ ref: doc.ref, nome: produto.nome, habilitacao, regras: regras.docs });
  if (notas.length) {
    divergencias.push({ nome: produto.nome, notas });
  }
}

console.log(`\nprodutos: ${produtos.size} · com regras a migrar: ${comRegras} · já migrados: ${jaMigrados}`);

for (const p of planos) {
  const anos = Object.entries(p.habilitacao);
  const obr = anos.filter(([, v]) => v === 'obrigatorio').map(([a]) => a);
  const opc = anos.filter(([, v]) => v === 'opcional').map(([a]) => a);
  console.log(`\n  ${p.nome}  (${p.regras.length} regras → ${anos.length} anos)`);
  if (obr.length) console.log(`     obrigatório: ${obr.join(', ')}`);
  if (opc.length) console.log(`     opcional:    ${opc.join(', ')}`);
}

if (divergencias.length) {
  console.log(`\n── atenção: ${divergencias.length} solução(ões) onde as regionais não diziam a mesma coisa ──`);
  for (const d of divergencias) {
    console.log(`  ${d.nome}`);
    for (const n of d.notas) console.log(`     ${n}`);
  }
} else {
  console.log('\nNenhuma divergência entre regionais: o colapso não muda nada para ninguém.');
}

if (!GRAVAR) {
  console.log('\nRELATÓRIO APENAS — nada foi gravado.');
  console.log('Confira acima e rode de novo com --gravar para aplicar.');
  process.exit(0);
}

let escritos = 0;
for (const p of planos) {
  const lote = db.batch();
  lote.update(p.ref, { habilitacao: p.habilitacao, atualizadoEm: new Date().toISOString() });
  for (const r of p.regras) lote.delete(r.ref);
  await lote.commit();
  escritos++;
}
console.log(`\n${escritos} solução(ões) migradas e subcoleção de regras apagada.`);
process.exit(0);
