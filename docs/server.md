# Servidor (Cloud Functions), regras e índices

## Arquitetura em uma frase

O cliente **nunca escreve** no Firestore. Toda escrita passa pela Cloud Function `api`, que chama
`executeOp` do código compartilhado (`src/shared`). As regras do Firestore só decidem **leitura**,
por papel e por dono do dado. O mesmo `executeOp` roda na demonstração (memória), nos testes e no
seed, então o que os testes provam vale para produção.

## Pacote `functions/`

| Arquivo | O que faz |
|---|---|
| `src/index.ts` | Declara as funções, parâmetros e segredos |
| `src/adminStore.ts` | `Store` sobre o firebase-admin (banco nomeado ou `(default)`) |
| `src/serverPorts.ts` | E-mail Resend, arquivos do Storage (URL assinada v4), cripto de CPF |
| `src/uploadCheck.ts` | Tipo real pelos bytes mágicos e limite de tamanho por pasta |
| `src/emulatorKeys.ts` | Chaves fixas SÓ do emulador (dados fictícios) |
| `build.mjs` | esbuild: `src/index.ts` (com `../../src/shared`) vira `lib/index.js` em CommonJS |
| `scripts/grant-master.mjs` | Concede ou revoga a claim `master` |
| `scripts/bootstrap/bootstrap-prod.mts` | Partida da produção: administradores gerais, planos e a primeira sociedade |
| `scripts/backup-export.md` | Comandos de backup para rodar ANTES da migração |

Build: `npm --prefix functions run build`. `firebase-admin` e `firebase-functions` ficam fora do
pacote (o deploy instala pelo `functions/package.json`); zod e o código compartilhado vão dentro.

## Funções (região `southamerica-east1`)

| Função | Tipo | Comportamento |
|---|---|---|
| `api` | callable | `{ op, input }`. Ator vem do token: uid, email, `email_verified`, `name`, claim `master`, `firebase.sign_in_second_factor` (MFA). IP de `rawRequest.ip`. `OpError` vira `HttpsError` com o mesmo código e mensagem; erro desconhecido vai ao log só com o nome da operação e um código técnico, e o cliente recebe mensagem genérica. Operações começadas com `__` e as marcadas `internal` são recusadas. App Check conforme `ENFORCE_APP_CHECK`. |
| `paymentsWebhook` | HTTP POST | `?tenant=ID`, corpo bruto, assinatura conferida por `provider.parseWebhook` (sandbox: cabeçalho `x-sandbox-signature`). Chama a operação interna `finance.applyPaymentEvent` com `{ tenantId, eventId, externalId, type, paidAmountCents, paidAt }`. Assinatura inválida: 401. Evento repetido (`already-exists`): 200. Erro transitório: 500 (o provedor reenvia; a operação é idempotente pelo `eventId`). |
| `ics` | HTTP GET | `?t=tenantId&k=token`. Chama a operação interna `calendar.icsFeed` `{ tenantId, token }` e responde `text/calendar`. Token inválido ou revogado: 404. |
| `daily` | agendada | Todo dia 05:30 (America/Sao_Paulo): para cada sociedade ativa, `runDailyJobs`. Falha de uma rotina não para as outras. |
| `uploadGuard` | Storage (finalize) | Para as pastas que o cliente grava (`public`, foto do sócio, `attachments`, `library`): confere tamanho e tipo real pelos bytes (jpeg, png, webp, pdf) e se o tipo declarado bate. Se não bater, apaga o arquivo. |
| `mirrorMembership`, `mirrorMember` | Firestore (escrita) | Só existem quando o banco principal **não** é o `(default)`. Copiam para o `(default)` o mínimo que as regras do Storage precisam (ver Limitações). |

Operações internas chamadas pelo servidor, escritas por outras frentes:
`finance.applyPaymentEvent` (frente C) e `calendar.icsFeed` (frente B, devolve `{ ics: string }`).
Enquanto não existirem, as funções respondem 200/404 sem efeito.

## Parâmetros e segredos

| Nome | Tipo | Padrão | Uso |
|---|---|---|---|
| `FIRESTORE_DATABASE_ID` | parâmetro | `firestoreDatabaseId` de `firebase-applet-config.json` | Banco usado pelo servidor. **Projetos novos: usar `(default)`.** No emulador é sempre `(default)`. |
| `APP_URL` | parâmetro | `http://localhost:3000` | Links de convite e QR |
| `MAIL_FROM` | parâmetro | `Sodalis <nao-responda@sodalis.app>` | Remetente (domínio verificado na Resend) |
| `ENFORCE_APP_CHECK` | parâmetro | `false` | Exigir App Check na `api` |
| `RESEND_API_KEY` | segredo | (vazio) | Sem chave, os e-mails ficam como "simulado" no outbox |
| `CPF_ENCRYPTION_KEY` | segredo | obrigatório | 32 bytes em base64 (AES-256-GCM) |
| `CPF_HMAC_KEY` | segredo | obrigatório | 32 bytes em base64 (índice cego por sociedade) |
| `SANDBOX_WEBHOOK_SECRET` | segredo | obrigatório | Assinatura do webhook do sandbox de pagamentos |

Sem as chaves de CPF válidas o servidor falha fechado (não grava nem lê CPF).
Os parâmetros ficam em `functions/.env.<projeto>` (sem segredos) ou são perguntados no deploy.

## Regras

- `firestore.rules`: modelo multi-tenant, negar por padrão, escrita do cliente sempre negada sob
  `tenants/`, `slugs`, `users`, `plans` e `platform`. Matriz de leitura documentada no próprio
  arquivo. A seção **LEGADO** (coleções da raiz da fase 0) ficou no fim, sem alteração, marcada
  para remoção depois da migração.
- `storage.rules`: quatro pastas liberadas (público, foto do sócio, anexos por módulo, biblioteca),
  com tipo declarado e tamanho; o resto negado.
- Testes: `tests/rules/tenant-isolation.test.ts` (todas as coleções, isolamento A x B, anônimo,
  e-mail não verificado, suporte expirado, nenhuma escrita), `tests/rules/storage.test.ts` e o
  teste da fase 0 (`tests/rules/firestore.rules.test.ts`).

### Decisão: `config/settings`

`get` liberado para qualquer conta logada com e-mail verificado (de qualquer sociedade), porque o
formulário de proposta precisa das categorias antes de existir vínculo. O documento não tem dado
pessoal (categorias, valores, modelos de e-mail, chave Pix pública). A operação `members.formOptions`
da frente B continua valendo e é o caminho preferido para a tela; se um dia `settings` passar a ter
algo sensível, basta trocar a regra para `isMember(t)` sem quebrar a proposta.

### Cuidado ao escrever regras de `list`

Na análise de uma consulta, `resource.data.get('campo', padrao)` assume o padrão quando a consulta
não filtra o campo. Com `!=` isso libera a lista sem filtro (foi encontrado e corrigido em
`notices`). Use comparação positiva com o campo direto (`resource.data.x == valor`).

### Consultas que o cliente precisa fazer com filtro

Quem não tem a permissão do módulo só lista com filtro pelo próprio dado:
`members` (`uid == meu uid` ou `dependentOf == meu memberId`), `notifications` (`uid`),
`charges` (`memberUid`), `privacyRequests` (`uid`), `events/{id}/guests` (`uid`),
`notices` (`audience.boardOnly == false` e `status == 'publicado'` para quem não é da diretoria),
`terms` para anônimo (`current == true`, e só com a página pública da sociedade ligada),
`calendar` e `library` (`visibility` em `publico`/`socios`), `events` para anônimo
(`publicListing == true`), `minutes` para sócio (`published == true`).

## Índices

`firestore.indexes.json` é gerado a partir do código por `npm run indexes:scan -- --write`
(heurística sobre `where` + `orderBy` nas chamadas com `P.algo(...)`; nunca remove índices).
Rode de novo sempre que telas ou operações novas criarem consultas; o emulador e o console também
mostram o link do índice que faltar.

## Lint e tipos

`npm run lint` = `eslint . && tsc --noEmit`. O typescript-eslint precisa da API JavaScript do
TypeScript 6, que o TypeScript 7 da raiz (compilador nativo) não tem; por isso ele fica isolado em
`tools/lint` (instalar com `npm run lint:install`). `react-hooks/rules-of-hooks` é erro; o resto é aviso.

## Publicar (quando autorizado)

Nada disto foi executado. Passo a passo em `docs/firebase-setup.md`.

```bash
npm --prefix functions run build
firebase deploy --only firestore:rules,firestore:indexes,storage --project ID
firebase deploy --only functions --project ID
```

## Limitações conhecidas

- **Regras do Storage só leem o banco `(default)`** (limite documentado do Firebase; e no máximo 2
  documentos por avaliação). Com o banco nomeado atual, as funções de espelho mantêm no `(default)`
  uma cópia mínima dos vínculos e do dono do cadastro. O espelho é eventual (segundos): uma
  revogação demora esse tempo para valer no Storage. Recomendação: nos projetos novos, usar o
  `(default)` como banco principal; aí o espelho nem é publicado.
- **Biblioteca no Storage:** a leitura do arquivo é por "ser membro"; a visibilidade fina
  (diretoria) fica no documento do Firestore. Arquivo de diretoria precisa de caminho não
  divulgado ou, melhor, entrega por URL assinada pelo servidor.
- **EXIF e redimensionamento** das fotos ainda não são feitos (`TODO(fase 9)` no `uploadGuard`).
- O master precisa de segundo fator; o emulador dispensa só nas Functions.
