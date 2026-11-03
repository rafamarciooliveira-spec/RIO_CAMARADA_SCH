# Desenvolvimento local com o Emulator Suite

Tudo roda na sua máquina, no projeto fictício `demo-sodalis`. Nada fala com o Firebase real.

## Pré-requisitos

- Node 22 ou mais novo e Java 21 (o emulador do Firestore e do Storage precisa do Java).
- Dependências instaladas:

```bash
npm install
npm install --prefix functions
npm run lint:install        # ferramentas de lint (pasta tools/lint)
```

## Subir tudo

Em três terminais:

```bash
# 1. Emuladores (Auth 9099, Firestore 8080, Functions 5001, Storage 9199, interface 4000)
npm run emulators

# 2. Dados simulados (com os emuladores no ar). --reset apaga os dados DO EMULADOR antes
npm run seed -- --reset

# 3. Front ligado aos emuladores (lê .env.emulator: VITE_USE_EMULATORS=true)
npm run dev:emu
```

Abra http://localhost:3000. A interface dos emuladores fica em http://127.0.0.1:4000.

`npm run emulators` gera `functions/lib` antes de subir. Depois de mudar código do servidor
(`functions/src` ou `src/shared`), rode `npm run functions:build`: o emulador recarrega sozinho.

## Entrar com as personas

O seed cria as contas no Auth Emulator, com e-mail verificado e provedor Google. Ao clicar em
"Entrar com Google", o emulador abre uma janela simulada: escolha a conta pelo e-mail.

| Persona | E-mail |
|---|---|
| Master da plataforma | demo-master@exemplo.invalid |
| Presidência | demo-presidencia@exemplo.invalid |
| Tesouraria | demo-tesouraria@exemplo.invalid |
| Portaria | demo-portaria@exemplo.invalid |
| Sócia | demo-socio@exemplo.invalid |

O seed lista no fim as contas e o endereço da sociedade (`/sociedade-exemplo`).
O gerador `src/shared/seed/demoData.ts` cria a sociedade completa (sócios, cobranças, lançamentos,
eventos, atas assinadas, votações, oficinas, reservas, patrimônio) com os vínculos de cada persona.
É o mesmo gerador da demonstração `/ver-sistema`.

### Particularidades do emulador

- **Segundo fator do master:** nas Functions do emulador o MFA do master é dispensado (`env.demo`
  só fica ligado quando `FUNCTIONS_EMULATOR=true`). As **regras** do Firestore continuam exigindo o
  segundo fator para listar planos, auditoria da plataforma e acessos de suporte. Para testar essas
  telas, cadastre um segundo fator por SMS na conta master pelo próprio app: o Auth Emulator não
  envia SMS, o código aparece no terminal dos emuladores.
- **Chaves de CPF:** o emulador usa chaves fixas e públicas (`functions/src/emulatorKeys.ts`),
  as mesmas do seed, para que o CPF fictício cifrado pelo seed possa ser lido pelas Functions.
  Em produção o servidor se recusa a subir sem `CPF_ENCRYPTION_KEY` e `CPF_HMAC_KEY` válidas.
- **E-mail:** sempre simulado no emulador. Convites devolvem o link para quem convidou.
- **Foto na validação:** URLs assinadas não funcionam no emulador; a validação volta sem foto.
- **Rotina diária:** o emulador não roda agendamentos sem o emulador do Pub/Sub; a função `daily`
  aparece como ignorada. As rotinas são testadas em `tests/ops` com `runDailyJobs`.
- Os parâmetros do emulador ficam em `functions/.env.local` (criado pelo Firebase CLI, fora do git).

## Testes

```bash
npm test             # operações e regras de negócio (memória, sem emulador)
npm run test:rules   # regras do Firestore e do Storage (sobe o emulador sozinho)
npm run lint         # ESLint + tipos
npm run indexes:scan # confere se as consultas do código têm índice em firestore.indexes.json
```

## Testar o script de partida da produção

Com os emuladores no ar, o mesmo script que prepara a produção roda contra o emulador (sem credenciais):

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199   npx tsx functions/scripts/bootstrap/bootstrap-prod.mts --project demo-sodalis --masters voce@teste.local --tenant functions/scripts/bootstrap/riocamarada.json
```
