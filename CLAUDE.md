# Levantamento de Interesse — contratação de soluções educacionais

Plataforma onde o gestor de cada unidade monta a contratação do ano seguinte,
solução por solução, e a regional aprova, devolve ou reprova.

**Projeto Firebase:** `plataformas-marista` · Firestore em `southamerica-east1`
**Site:** https://plataformas-marista.web.app
**Escala:** 97 unidades · 6 regionais · ~13 soluções · 17 anos escolares

## Estrutura

```
dominio/          código puro compartilhado entre app e functions
  anosEscolares   catálogo dos 17 anos (EI1..EI5, EF1..EF9, EM1..EM3)
  tipos           documentos do Firestore
  preco           normalização de preço → valor anual em CENTAVOS
  habilitacao     resolve produto × regional × ano → o que a unidade pode contratar
src/              app React (Vite + Tailwind v4)
  lib/            firebase, auth (claims), tema
  componentes/    design system + layout
  paginas/        telas
functions/src/    Cloud Functions (região southamerica-east1)
test/             preco.test.ts (puro) · regras.test.ts (emulador)
```

## Regras que não se negociam

**Dinheiro é inteiro em centavos.** Nunca float. `dominio/preco.ts` é a fonte
da verdade e roda nos dois lados; `test/preco.test.ts` existe para eles não
divergirem.

**Escrita de pedido só por Cloud Function.** As regras do Firestore negam
`create/update/delete` em `pedidos/{id}`. O envio recalcula os totais no
servidor, congela o preço no item e valida a transição de estado. Total vindo
do cliente é ignorado — por isso o valor que o gestor vê é resposta imediata,
não o número gravado.

**Papel e vínculo vivem em custom claims**, gravados só por `definirPapel` e
`resgatarConvite`. A coleção `usuarios` é somente leitura para o cliente.
Esconder na interface não é proteger: as duas camadas existem.

**Nunca escrever regra curinga permissiva** em `firestore.rules`. As regras se
combinam por OU — uma `match /{doc=**} { allow read: if true }` anula o arquivo
inteiro. (O `firebase init` tenta plantar exatamente isso; se rodar de novo,
confira o arquivo depois.)

**Obrigatoriedade é da regra, não do produto.** A mesma solução pode ser
obrigatória no Fundamental de Recife e indisponível no Médio de Curitiba.

**Modo escuro por inversão de variável.** `src/tema-escuro.css` redefine os
tokens; nenhum componente usa `dark:`. Tela nova nasce com os dois temas.
Espaçamento sai sempre de `gap` de flex/grid, nunca de margem avulsa.

## Comandos

```bash
npm run dev          # servidor local em :5173
npm run build        # typecheck + build
npm test             # testes de domínio (rápido, sem emulador)
npm run test:regras  # testes das regras do Firestore (precisa de Java)
npm run emu          # emuladores locais
firebase deploy --only hosting,firestore:rules
```

## Acesso enquanto o SSO não existe

O Entra ID está com a TI, então a entrada provisória é **conta Google**, num
botão marcado como `acesso interno` em `src/paginas/Entrar.tsx`. Remover quando
o SSO Microsoft subir.

Autenticar não concede nada: sem o claim `papel`, todas as regras negam e a
pessoa para na tela "sem vínculo". Quem concede papel:

```bash
cd functions
node scripts/papel.mjs listar
node scripts/papel.mjs definir  <email> admin
node scripts/papel.mjs convidar <email> gestor_unidade <regionalId> <unidadeId>
node scripts/papel.mjs limpar   <email>
```

`convidar` também devolve um link para a pessoa definir a própria senha —
ninguém escolhe senha pelos outros nem transmite senha por mensagem. É assim
que se montam contas de teste de cada papel.

Usa as Application Default Credentials da conta do Firebase CLI — nenhuma chave
de serviço é criada. Depois do Blaze, prefira a function `definirPapel`, que
valida o vínculo e registra quem promoveu quem.

`scripts/ativar-auth.mjs` diagnostica o estado do Firebase Authentication.

## Estado atual

Pronto: domínio, regras do Firestore (implantadas), Cloud Functions escritas e
compilando, base de sessão com SSO Microsoft e link de acesso, design system,
hosting no ar.

Falta: telas do fluxo do gestor (etapas 2 a 5), fila da regional, painel do
admin, e **deploy das functions — exige o plano Blaze**.

Pendências externas: plano Blaze; registro do app no Entra ID (`VITE_MS_TENANT_ID`);
JDK instalado para rodar `test:regras` localmente.
