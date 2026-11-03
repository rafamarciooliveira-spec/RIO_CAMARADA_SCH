# Firebase: configuração da produção

Projeto: **`sodalis-5be4d`** (alias `prod` no `.firebaserc`), plano Blaze, tudo em `southamerica-east1` (São Paulo).
Não há migração de dados: o projeto começa limpo e a primeira sociedade é criada pelo script de partida.

## Custo

Blaze é pago por uso, sem mensalidade. Com o volume de uma ou poucas sociedades o uso fica dentro das cotas gratuitas
(Firestore, Storage, Functions, Auth com Google e link por e-mail). O que pode gerar centavos: o Secret Manager
(algumas chaves) e o Artifact Registry das Functions. Deixe um alerta de orçamento de R$ 30 em
Google Cloud > Faturamento > Orçamentos e alertas para ser avisado de qualquer surpresa.

Escolhas que seguram o custo: leitura só do que a tela mostra (listas paginadas e com limite), agregados prontos
no painel, Functions com `minInstances: 0`, notificação no celular pelo FCM (gratuito) e sem segundo fator por SMS.

## 1. Console (feito em 03/11/2026)

- Projeto criado, app web "Sodalis Web" registrado (configuração pública em `firebase-applet-config.json`).
- Authentication: Google e E-mail com link (sem senha). Domínio autorizado: `riocamarada.vercel.app`.
- Firestore `(default)` Standard em `southamerica-east1`, modo produção.
- Storage em `southamerica-east1`, modo produção.
- Cloud Messaging: par de chaves Web Push gerado (`vapidKey` no arquivo de configuração).
- Segundo fator (Identity Platform): **não ativado**, para manter o plano gratuito do Auth.
  O painel master funciona sem ele (`REQUIRE_MASTER_MFA=false`). Para exigir no futuro: ativar o Identity Platform,
  pôr `REQUIRE_MASTER_MFA=true` em `functions/.env.prod` e voltar a checagem `sign_in_second_factor` em `isMaster()` das regras.

Ao trocar de domínio (ex.: domínio próprio), acrescente o novo em Authentication > Configurações > Domínios autorizados,
em `cors.json` e em `APP_URL` de `functions/.env.prod`, e publique de novo.

## 2. Segredos (Secret Manager)

Gere as chaves num terminal Git Bash e guarde uma cópia num cofre de senhas: **sem elas os CPFs cifrados não podem ser lidos**.

```bash
npx firebase functions:secrets:set CPF_ENCRYPTION_KEY --project prod
npx firebase functions:secrets:set CPF_HMAC_KEY --project prod
npx firebase functions:secrets:set SANDBOX_WEBHOOK_SECRET --project prod
npx firebase functions:secrets:set RESEND_API_KEY --project prod
```

Valor de cada uma das três primeiras: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
`RESEND_API_KEY` pode começar com `sem-chave`: os e-mails ficam como "simulado" e os convites mostram o link para copiar.
Quando a conta do Resend existir, troque o valor e ajuste `MAIL_FROM` em `functions/.env.prod`.

## 3. CORS do Storage

Sem isto as fotos, o logo nos PDFs e as carteirinhas não carregam no site publicado.

```bash
gcloud storage buckets update gs://sodalis-5be4d.firebasestorage.app --cors-file=cors.json
```

## 4. Publicar regras, índices e servidor

```bash
npx firebase deploy --project prod --only firestore,storage
npx firebase deploy --project prod --only functions
```

Na primeira vez a CLI pede para ativar APIs (Cloud Functions, Cloud Build, Artifact Registry, Scheduler, Eventarc):
responda sim. Índices novos levam alguns minutos para ficar prontos.

## 5. Script de partida (administradores e primeira sociedade)

```bash
gcloud auth application-default login
npx tsx functions/scripts/bootstrap/bootstrap-prod.mts --project sodalis-5be4d --masters email1,email2 --tenant functions/scripts/bootstrap/riocamarada.json
```

Cria os administradores gerais da plataforma (claim `master`), os planos, a sociedade do arquivo JSON (nome, fundação,
slogan, cores e logo) e coloca os administradores como presidência dela. Pode rodar de novo sem duplicar nada.
Depois, cada administrador sai e entra de novo para o acesso valer.

## 6. Site (Vercel)

O site publicado busca o servidor em `southamerica-east1-sodalis-5be4d.cloudfunctions.net` (ver `vercel.json`).
Publique o código novo no Vercel depois do passo 4.

## Backups (opcional, recomendado)

Com o Blaze dá para ligar backup diário do Firestore com retenção de 7 dias:

```bash
gcloud firestore backups schedules create --database="(default)" --recurrence=daily --retention=7d --project sodalis-5be4d
```

O custo é o armazenamento do backup (centavos para uma sociedade).
