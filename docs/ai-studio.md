# Usando este projeto no Google AI Studio

O zip `dist-ai-studio/sodalis-ai-studio.zip` tem a mesma estrutura do zip original (app Vite na raiz) e pode ser enviado ao AI Studio.

## O que roda no AI Studio
- O front inteiro (`npm run dev` e `npm run build` na raiz, sem passo manual).
- A landing (`/`) e a demonstração **Ver sistema** (`/ver-sistema`), que usa só dados fictícios no navegador.
- O portal real (`/{slug}`) lê o Firestore do projeto configurado em `firebase-applet-config.json`. **Toda escrita depende da Cloud Function `api`**: sem o servidor publicado, a tela mostra um aviso claro ("O servidor da plataforma ainda não foi publicado") em vez de contornar a segurança.

## O que NÃO roda no AI Studio (publicação separada, pela Firebase CLI)
- Cloud Functions (`functions/`): `npx firebase deploy --project prod --only functions`
- Regras e índices do Firestore e regras do Storage: `npx firebase deploy --project prod --only firestore,storage`
- Agendamento diário (Cloud Scheduler) e segredos (Secret Manager): ver `docs/firebase-setup.md`.

## Cuidados para não desfazer a segurança em edições futuras
1. **Não deixe o AI Studio regravar `firestore.rules`.** Se ele publicar regras próprias, a segurança volta à estaca zero. Depois de qualquer edição no AI Studio, confira o arquivo e publique de novo pela CLI.
2. **Nunca peça "login de teste", "usuário demo" ou "acesso rápido".** A demonstração já existe em `/ver-sistema`, isolada do banco. Credenciais no código foram o problema crítico da versão original.
3. **Nunca faça a tela gravar direto no Firestore.** Toda escrita passa por `useOp().run('operacao', {...})`, que chama o servidor. As regras negam escrita do cliente.
4. **Nunca mostre CPF completo, e-mail ou telefone na validação do QR** nem guarde esses dados no `localStorage`.
5. **Não coloque segredos** (chaves, tokens) em nenhum arquivo. `firebase-applet-config.json` só tem a configuração pública do cliente.
6. Antes de publicar qualquer mudança, rode: `npm run typecheck`, `npm test`, `npm run build`, `npm run scan:secrets` e, se mexeu em regras, `npm run test:rules`.
7. A demonstração não pode importar nada do Firebase: o teste `tests/demo-isolation.test.ts` garante isso.
