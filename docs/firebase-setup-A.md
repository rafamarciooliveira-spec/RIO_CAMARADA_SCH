# Firebase real: o que fazer no console e na CLI (frente A)

Lista para consolidar. **Nada aqui foi executado.** Cada passo depende de aprovação explícita.

## 1. Projetos e região

1. Criar projetos separados: `sodalis-dev`, `sodalis-staging`, `sodalis-prod` (nomes a decidir),
   no plano Blaze (Functions, Scheduler e Secret Manager exigem).
2. Firestore no modo nativo, banco **`(default)`**, região **`southamerica-east1`** (não muda depois).
   Usar o `(default)` evita o espelho das regras do Storage (ver `docs/server.md`).
3. Cloud Storage: bucket padrão em `southamerica-east1`.
4. Atualizar `firebase-applet-config.json` de cada ambiente com a configuração pública do app Web
   e `firestoreDatabaseId: "(default)"`. Criar `.firebaserc` com os aliases dos projetos.

## 2. Authentication

1. Ativar o provedor Google. Ativar "Link por e-mail (login sem senha)". **Desativar e-mail/senha.**
2. Domínios autorizados: só os do app (sem `localhost` em produção).
3. Atualizar para Identity Platform e ativar **MFA** (SMS e/ou TOTP); o painel master exige.
4. Bloquear criação de contas por API se não for usada; ativar proteção contra enumeração de e-mail.

## 3. Segredos e parâmetros (Secret Manager)

```bash
openssl rand -base64 32 | firebase functions:secrets:set CPF_ENCRYPTION_KEY --data-file=- --project ID
openssl rand -base64 32 | firebase functions:secrets:set CPF_HMAC_KEY --data-file=- --project ID
openssl rand -base64 32 | firebase functions:secrets:set SANDBOX_WEBHOOK_SECRET --data-file=- --project ID
firebase functions:secrets:set RESEND_API_KEY --project ID
```

- Guardar uma cópia das chaves de CPF fora do Google Cloud (cofre da diretoria técnica): sem elas
  os CPFs cifrados ficam ilegíveis. **Nunca trocar a chave de CPF sem rotina de recifragem.**
- Parâmetros em `functions/.env.ID` (sem segredos): `APP_URL`, `MAIL_FROM`,
  `FIRESTORE_DATABASE_ID=(default)`, `ENFORCE_APP_CHECK=true` (depois de ligar o App Check no app).
- Resend: verificar o domínio do remetente (SPF, DKIM) antes de usar `MAIL_FROM`.

## 4. App Check

1. Registrar o app Web com reCAPTCHA Enterprise; colocar a chave de site em `recaptchaSiteKey`.
2. Monitorar as métricas uma semana; depois `ENFORCE_APP_CHECK=true` e ativar a imposição no
   Firestore e no Storage pelo console.

## 5. Deploy (na ordem)

```bash
gcloud firestore export gs://ID-backups/$(date +%F)            # backup antes de tudo
npm ci && npm ci --prefix functions
npm --prefix functions run build
firebase deploy --only firestore:rules,firestore:indexes,storage --project ID
firebase deploy --only functions --project ID
```

- O primeiro deploy de Functions pede para habilitar APIs (Cloud Functions, Cloud Build, Artifact
  Registry, Eventarc, Cloud Scheduler, Pub/Sub, Secret Manager). Aceitar.
- O gatilho do Storage precisa que a conta de serviço do Cloud Storage tenha `pubsub.publisher`
  (o CLI oferece conceder).
- Se o banco principal continuar NOMEADO (projeto atual do AI Studio): `firebase.json` precisa do
  formato em lista (`"firestore": [{ "database": "(default)", ... }, { "database": "NOME", ... }]`)
  para publicar regras e índices nos dois bancos; criar o `(default)` na mesma região; os gatilhos
  `mirrorMembership` e `mirrorMember` rodam na região do banco nomeado (confirmar).

## 6. Primeiro master

```bash
gcloud auth application-default login
node functions/scripts/grant-master.mjs pessoa@dominio --project ID
```

A pessoa entra uma vez antes, verifica o e-mail e cadastra o segundo fator. Depois sai e entra de novo.

## 7. Migração da versão 1 (projeto atual do AI Studio)

1. Backup: `functions/scripts/backup-export.md`.
2. Simulação: `npx tsx functions/scripts/migrate-v1.ts --name "..." --slug ...` e revisar o relatório.
3. Criar o plano em `plans/` pelo painel master.
4. Gravar: mesma linha com `--commit` e as chaves de CPF do Secret Manager em variáveis de ambiente.
5. Conferir no app; só então remover a seção LEGADO de `firestore.rules` (nada é apagado pelo script).

## 8. Operação

- Ativar PITR no Firestore (`gcloud firestore databases update --enable-pitr`) e agendar export diário.
- Testar a restauração em um banco de teste a cada trimestre.
- Restringir a chave de API do navegador por referenciador HTTP (domínios do app) e por APIs.
- Alertas no Cloud Monitoring: erros da `api`, `webhook_assinatura_invalida`, `upload_removido`,
  picos de `resource-exhausted` (abuso).
- Orçamento e alertas de faturamento no projeto.
- GitHub: proteger a branch `main` exigindo o job `CI` verde; ativar Dependabot e secret scanning.
