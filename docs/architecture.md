# Arquitetura do Sodalis

## Visão geral

```
Navegador (React 19 + Vite)                       Google Cloud / Firebase (projeto atual = produção)
┌──────────────────────────────┐                  ┌───────────────────────────────────────────────┐
│ Landing  /                   │                  │ Firestore (banco nomeado do AI Studio)          │
│ Demo     /ver-sistema  ──────┼─ memória, sem rede│   tenants/{t}/...   leitura só pelas regras     │
│ Master   /master             │                  │   escrita: NUNCA pelo cliente                   │
│ Portal   /{slug}/...         │── leitura ──────▶│                                                 │
│   telas → useData()          │                  │ Cloud Functions (southamerica-east1)            │
│   escrita → op('nome', {...})│── callable api ─▶│   api: executeOp(op, input, ator)               │
│ Validação /{slug}/v/{token}  │── card.verify ──▶│   paymentsWebhook, ics, daily (Scheduler)       │
└──────────────────────────────┘                  │   onUploadFinalize (Storage)                    │
                                                   │ Storage: fotos privadas, logos públicas         │
                                                   │ Secret Manager: Resend, chaves do CPF, webhook  │
                                                   └───────────────────────────────────────────────┘
```

## Princípios
1. **Regra de negócio escrita uma vez** em `src/shared/ops/*` (TypeScript puro, sem SDK). A mesma função roda:
   na Cloud Function `api` (com o Firestore Admin), na demonstração (banco em memória) e nos testes.
2. **Cliente só lê.** Toda escrita passa por uma operação com schema Zod, nível de autenticação, permissão por módulo,
   limite de taxa, idempotência (`requestId`) e auditoria. As regras do Firestore negam escrita do cliente em tudo.
3. **Multi-tenant por caminho:** tudo de uma sociedade fica em `tenants/{tenantId}/...`. As regras conferem a membership
   (`tenants/{t}/memberships/{uid}`), que guarda as permissões já calculadas dos papéis. Revogar = apagar/alterar esse
   documento, com efeito imediato (sem cache de claims). Só o master usa claim (`master`), concedida por script, com MFA.
4. **Mínimo necessário:** perfil básico em `members/{id}`; CPF, nascimento, contato e endereço em `members/{id}/private/pii`,
   com CPF cifrado (AES-256-GCM) e índice cego HMAC por sociedade para deduplicar. Validação pública só devolve situação,
   nome reduzido, categoria, validade e foto (se a sociedade permitir).
5. **Dinheiro em centavos, datas do servidor, fuso por sociedade** (`America/Sao_Paulo` por padrão).
6. **Imutabilidade:** lançamentos do livro caixa não se editam nem se apagam (estorno); atas aprovadas não se editam (versões).

## Pastas
- `src/shared/`: modelo de dados (`types.ts`), caminhos (`paths.ts`), módulos e papéis (`modules.ts`), núcleo
  (`core/`: executor, store, portas, pagamentos sandbox), operações (`ops/`), regras puras (cpf, slug, money, dates,
  memberStatus, finance/reports, ofx), dados simulados (`seed/demoData.ts`).
- `src/data/`: camada de dados do app (`client.ts` contrato, `firebaseClient.ts`, `firebaseSession.ts`, `memoryClient.ts`).
- `src/app/`: contextos (dados, sessão, sociedade), shell do portal, raiz real, PDF, PWA.
- `src/modules/`: telas por domínio (lazy loading), registradas em `src/modules/registry.tsx`.
- `src/ui/`: design system tokenizado (cores da sociedade em variáveis CSS, tema claro/escuro).
- `functions/`: Cloud Functions (empacota `src/shared` com esbuild).
- `tests/`: operações (sem emulador), regras (emulador), isolamento da demonstração.

## Região e ambientes
- Produção = projeto Firebase `sodalis-5be4d`, banco `(default)`, Functions e Storage, tudo em `southamerica-east1`
  (ver `docs/firebase-setup.md`). Sem migração: o projeto antigo do AI Studio não é usado.
- Desenvolvimento = Emulator Suite com dados simulados (`docs/local-dev.md`). Staging: criar depois um projeto separado.

## Fluxos críticos
- **Carteirinha:** `card.issue` gera token aleatório de 32 bytes, grava só o SHA-256 em `cardTokens` com expiração
  (rotativo 90 s; download 24 h). `card.verify` confere hash, prazo e a situação ATUAL do sócio (suspensão vale na hora).
- **Proposta de sócio:** `members.apply` (logado, ainda sem vínculo) → cadastro `pendente` + membership papel sócio →
  diretoria `members.approve` (matrícula sequencial, validade pela regra da sociedade).
- **Adimplência:** rotina diária marca cobranças vencidas e ajusta a situação (em atraso → suspenso) pela regra da sociedade.
- **Votação secreta:** `elections.vote` grava, na mesma transação, `voters/{memberId}` (só que votou) e `ballots/{aleatório}`
  (só a opção). Não há vínculo entre os dois.
