# Publicação e reversão

## Checklist antes de publicar
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` verdes
- [ ] `npm run test:rules` verde (se mexeu em regras ou no modelo de dados)
- [ ] `npm run scan:secrets` sem achados
- [ ] `npm run indexes:scan` sem índice faltando
- [ ] Backup recente do Firestore (export) se a mudança mexe em dados

## Ordem de publicação
1. Functions (`--only functions`): as operações novas precisam existir antes das telas que as chamam.
2. Regras e índices (`--only firestore,storage`).
3. Front (push para o GitHub; o Vercel publica).

Comandos completos em `docs/firebase-setup.md` (Parte C).

## Reversão (rollback)
- **Front:** no Vercel, Deployments > escolha a publicação anterior > Promote to Production (instantâneo).
- **Functions:** volte o código ao commit anterior (`git checkout <commit> -- functions src/shared`) e publique `--only functions`. As operações são compatíveis para trás enquanto o modelo de dados não muda.
- **Regras:** o console do Firestore guarda o histórico de regras (Regras > histórico); dá para restaurar a versão anterior com um clique, ou publicar o `firestore.rules` do commit anterior.
- **Dados:** restaurar do export (`gcloud firestore import gs://.../pasta --database=...`) num banco de teste primeiro; com PITR ativo, ler a versão de até 7 dias atrás.
- Lançamentos financeiros e atas nunca são apagados pelo sistema; correção de dados financeiros é sempre por estorno.

## Ambientes
- Produção: projeto `sodalis-5be4d` (alias `prod` em `.firebaserc`). Passo a passo em `docs/firebase-setup.md`.
- Local: Emulator Suite (`docs/local-dev.md`), projeto `demo-sodalis`, dados simulados.
- Staging: recomendado criar depois um projeto separado com banco `(default)` e apontar o preview do Vercel para ele.
