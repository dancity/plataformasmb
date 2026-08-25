/**
 * Popula o ciclo 2027 com dados de teste realistas: as 6 regionais, cinco
 * fornecedores, uma unidade fictícia de 1.230 alunos e seis soluções com as
 * regras de habilitação já montadas.
 *
 * São exatamente os números do plano — é o que permite conferir na tela se o
 * total bate com R$ 162.500/ano, em vez de olhar para um número qualquer e
 * torcer.
 *
 * Idempotente: rodar de novo atualiza em vez de duplicar.
 *
 * Uso:
 *   node scripts/semear.mjs
 *   node scripts/semear.mjs --gestor gestor.teste@exemplo.com
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJETO = process.env.GCLOUD_PROJECT ?? 'plataformas-marista';
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJETO;

initializeApp({ credential: applicationDefault(), projectId: PROJETO });
const db = getFirestore();
const auth = getAuth();

const CICLO = 'c2027';
const UNIDADE = 'boa-viagem';
const REGIONAL = 'recife';
const agora = () => new Date().toISOString();
const emDias = (d) => new Date(Date.now() + d * 86_400_000).toISOString();

const REGIONAIS = [
  ['recife', 'Recife'],
  ['brasilia', 'Brasília'],
  ['belo-horizonte', 'Belo Horizonte'],
  ['porto-alegre', 'Porto Alegre'],
  ['curitiba', 'Curitiba'],
  ['sao-paulo', 'São Paulo'],
];

const FORNECEDORES = [
  ['editora-alfa', 'Editora Alfa'],
  ['convivere', 'Convivere'],
  ['makerlab', 'MakerLab'],
  ['instituto-beta', 'Instituto Beta'],
  ['nexo', 'Nexo'],
  ['ler-mais', 'Ler+'],
];

const EI = ['EI1', 'EI2', 'EI3', 'EI4', 'EI5'];
const EF_INICIAIS = ['EF1', 'EF2', 'EF3', 'EF4', 'EF5'];
const EF_FINAIS = ['EF6', 'EF7', 'EF8', 'EF9'];
const EM = ['EM1', 'EM2', 'EM3'];
const FUND_E_MEDIO = [...EF_INICIAIS, ...EF_FINAIS, ...EM];

/** Previsão da unidade fictícia: 1.230 alunos, os números do plano. */
const PREVISAO = {
  EI1: 30, EI2: 40, EI3: 45, EI4: 47, EI5: 48,
  EF1: 88, EF2: 92, EF3: 90, EF4: 86, EF5: 84,
  EF6: 96, EF7: 94, EF8: 90, EF9: 92,
  EM1: 74, EM2: 68, EM3: 66,
};

const PRODUTOS = [
  {
    id: 'avaliacao-diagnostica',
    nome: 'Avaliação Diagnóstica Nacional',
    fornecedorId: 'editora-alfa',
    categoria: 'Avaliação',
    descricao:
      'Três aplicações por ano com relatório por turma e por habilidade da BNCC, mais formação para leitura dos resultados.',
    precificacao: { base: 'aluno', ciclo: 'anual', valor: 4000, meses: 12 },
    ordem: 10,
    // Obrigatória do 1º ano à 3ª série, em toda a rede.
    obrigatorio: FUND_E_MEDIO,
    opcional: [],
  },
  {
    id: 'socioemocional',
    nome: 'Educação Socioemocional',
    fornecedorId: 'convivere',
    categoria: 'Socioemocional',
    descricao:
      'Trilha socioemocional com material do estudante, guia do professor e formação continuada.',
    precificacao: { base: 'aluno', ciclo: 'anual', valor: 2200, meses: 12 },
    ordem: 20,
    obrigatorio: [...EI, ...EF_INICIAIS],
    opcional: [],
  },
  {
    id: 'robotica',
    nome: 'Robótica Educacional',
    fornecedorId: 'makerlab',
    categoria: 'Robótica e tecnologia',
    descricao:
      'Kits e trilha curricular de robótica com formação de professores. Inclui plataforma de acompanhamento e dois encontros presenciais por semestre.',
    precificacao: { base: 'aluno', ciclo: 'mensal', valor: 1500, meses: 10 },
    ordem: 30,
    obrigatorio: [],
    opcional: [...EI, ...EF_INICIAIS, ...EF_FINAIS], // não habilitada no Médio
  },
  {
    id: 'simulado-enem',
    nome: 'Simulado ENEM',
    fornecedorId: 'instituto-beta',
    categoria: 'Simulados',
    descricao:
      'Seis simulados por ano no padrão ENEM, com correção de redação e relatório comparativo entre unidades.',
    precificacao: { base: 'aluno', ciclo: 'mensal', valor: 900, meses: 10 },
    ordem: 40,
    obrigatorio: [],
    opcional: ['EF9', ...EM],
  },
  {
    id: 'laboratorio-virtual',
    nome: 'Laboratório Virtual de Ciências',
    fornecedorId: 'nexo',
    categoria: 'Outros',
    descricao:
      'Licença de simuladores de física, química e biologia para a unidade inteira, com acesso ilimitado de estudantes e professores.',
    // Cobrança por escola: marcar mais anos não muda o valor.
    precificacao: { base: 'escola', ciclo: 'mensal', valor: 120_000, meses: 12 },
    ordem: 50,
    obrigatorio: [],
    opcional: FUND_E_MEDIO,
  },
  {
    id: 'plataforma-leitura',
    nome: 'Plataforma de Leitura',
    fornecedorId: 'ler-mais',
    categoria: 'Leitura e literatura',
    descricao:
      'Acervo digital com mais de 4.000 títulos, trilhas de leitura por ano escolar e painel de acompanhamento para o professor.',
    precificacao: { base: 'aluno', ciclo: 'mensal', valor: 1100, meses: 10 },
    ordem: 60,
    obrigatorio: [],
    opcional: [...EF_INICIAIS, ...EF_FINAIS],
  },
];

async function semear() {
  const lote = db.batch();

  lote.set(
    db.collection('ciclos').doc(CICLO),
    {
      nome: 'Contratação 2027',
      anoAlvo: 2027,
      estado: 'aberto',
      aberturaEm: agora(),
      prazoGestor: emDias(45),
      prazoRegional: emDias(75),
      criadoEm: agora(),
    },
    { merge: true },
  );

  for (const [id, nome] of REGIONAIS) {
    lote.set(db.collection('regionais').doc(id), { nome, ativa: true }, { merge: true });
  }

  for (const [id, nome] of FORNECEDORES) {
    lote.set(db.collection('fornecedores').doc(id), { nome }, { merge: true });
  }

  lote.set(
    db.collection('unidades').doc(UNIDADE),
    { nome: 'Colégio Marista Boa Viagem', codigo: UNIDADE, regionalId: REGIONAL, ativa: true },
    { merge: true },
  );

  lote.set(
    db.collection('matriculas').doc(`${CICLO}_${UNIDADE}`),
    {
      cicloId: CICLO,
      unidadeId: UNIDADE,
      regionalId: REGIONAL,
      porAno: PREVISAO,
      origem: 'admin',
      atualizadoPor: 'semeadura',
      atualizadoEm: agora(),
    },
    { merge: true },
  );

  await lote.commit();

  // Produtos e regras em lote próprio: o lote anterior já está perto do teto
  // de 500 operações quando as regras entram.
  for (const p of PRODUTOS) {
    const ref = db.collection('produtos').doc(p.id);
    await ref.set(
      {
        cicloId: CICLO,
        nome: p.nome,
        fornecedorId: p.fornecedorId,
        categoria: p.categoria,
        descricao: p.descricao,
        precificacao: p.precificacao,
        ordem: p.ordem,
        visibilidade: 'publicado',
        criadoEm: agora(),
        atualizadoEm: agora(),
      },
      { merge: true },
    );

    const regras = db.batch();
    for (const [, regionalId] of REGIONAIS.map((r) => [r[1], r[0]])) {
      for (const ano of p.obrigatorio) {
        regras.set(ref.collection('regras').doc(`${regionalId}_${ano}`), {
          produtoId: p.id,
          regionalId,
          anoEscolar: ano,
          obrigatoriedade: 'obrigatorio',
        });
      }
      for (const ano of p.opcional) {
        regras.set(ref.collection('regras').doc(`${regionalId}_${ano}`), {
          produtoId: p.id,
          regionalId,
          anoEscolar: ano,
          obrigatoriedade: 'opcional',
        });
      }
    }
    await regras.commit();
    console.log(
      `  ${p.nome} — ${p.obrigatorio.length} obrigatórios + ${p.opcional.length} opcionais × 6 regionais`,
    );
  }
}

async function criarGestor(email) {
  let usuario;
  try {
    usuario = await auth.getUserByEmail(email);
  } catch {
    usuario = await auth.createUser({ email });
  }
  const claims = { papel: 'gestor_unidade', unidadeId: UNIDADE, regionalId: REGIONAL };
  await auth.setCustomUserClaims(usuario.uid, claims);
  await auth.revokeRefreshTokens(usuario.uid);
  await db.collection('usuarios').doc(usuario.uid).set(
    { email, papel: 'gestor_unidade', unidadeId: UNIDADE, regionalId: REGIONAL, ativo: true },
    { merge: true },
  );

  const link = await auth.generatePasswordResetLink(email);
  console.log(`\nGestor de teste: ${email} → Colégio Marista Boa Viagem (Recife)`);
  console.log('Link para definir a senha:');
  console.log(link);
}

const args = process.argv.slice(2);
const idxGestor = args.indexOf('--gestor');

console.log(`Semeando ${PROJETO} · ciclo ${CICLO}`);
await semear();
console.log('\nCiclo aberto, 6 regionais, 6 fornecedores, 1 unidade e 6 soluções.');
console.log('Previsão da unidade: 1.230 alunos.');
console.log('Total esperado se o gestor contratar tudo o que o plano prevê: R$ 162.500,00/ano.');

if (idxGestor >= 0 && args[idxGestor + 1]) {
  await criarGestor(args[idxGestor + 1]);
}

process.exit(0);
