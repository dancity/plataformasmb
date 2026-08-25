# Levantamento de Interesse

Plataforma onde o gestor de cada unidade monta a contratação de soluções
educacionais do ano seguinte — solução por solução, vendo o que é obrigatório,
o que é opcional e quanto custa — e a regional aprova, devolve ou reprova.

97 unidades · 6 regionais · ~13 soluções · 17 anos escolares.

## Como rodar

```bash
npm install
npm run dev          # http://localhost:5173
```

O app aponta para o projeto Firebase `plataformas-marista`. A configuração web
do Firebase é pública por natureza — ela identifica o projeto, não autoriza
nada. Quem autoriza são as regras do Firestore e os *custom claims*.

```bash
npm run build        # typecheck + build
npm test             # testes de domínio (rápido, sem emulador)
npm run test:regras  # testes das regras do Firestore (precisa de Java)
npm run emu          # emuladores locais
```

## Estrutura

```
dominio/          código puro, compartilhado entre app e Cloud Functions
src/              app React (Vite + Tailwind v4)
functions/src/    Cloud Functions (southamerica-east1)
functions/scripts/utilitários de administração (papéis, semeadura, conferência)
test/             preco.test.ts (puro) · regras.test.ts (emulador)
```

## Decisões que sustentam o resto

**Dinheiro é inteiro em centavos.** Nunca float. `dominio/preco.ts` é a fonte da
verdade e roda nos dois lados; `test/preco.test.ts` existe para eles não
divergirem.

**Escrita de pedido só por Cloud Function.** As regras do Firestore negam
alteração direta em `pedidos/{id}`. O envio recalcula os totais no servidor,
congela o preço no item e valida a transição de estado — total vindo do cliente
é ignorado. A única exceção é abrir o próprio rascunho vazio, que não move
dinheiro nem estado.

**Papel e vínculo vivem em custom claims.** A coleção `usuarios` é somente
leitura para o cliente. Esconder na interface não é proteger: as duas camadas
existem, e as regras têm teste.

**Obrigatoriedade é da regra, não do produto.** A mesma solução pode ser
obrigatória no Fundamental de Recife e indisponível no Médio de Curitiba: a
unidade de configuração é `produto × regional × ano escolar`.

**Modo escuro por inversão de variável.** `src/tema-escuro.css` redefine os
tokens; nenhum componente usa `dark:`. Tela nova nasce com os dois temas.

## Estado

Pronto: domínio e testes, regras do Firestore implantadas, catálogo do admin
(ciclo, soluções, fornecedores, unidades, grade de habilitação) e o fluxo do
gestor até o mapa da contratação.

Em andamento: envio do pedido e fila de aprovação da regional — dependem das
Cloud Functions, que já estão escritas e compilando.

Pendente fora do código: registro do app no Entra ID para o SSO Microsoft
(`VITE_MS_TENANT_ID`); enquanto isso a entrada é por conta Google, marcada como
`acesso interno` na tela de login.
