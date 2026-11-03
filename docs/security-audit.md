# Auditoria de segurança: Portal do Associado (origem do Sodalis)

Data: 02/11/2026. Base: zip gerado no Google AI Studio em 31/10/2026 (53 arquivos), já em uso no Vercel com o Firebase `spatial-expanse-ncxst`.

Legenda da situação: **Corrigido (F0)** = resolvido na fase 0; **Contido (F0)** = risco reduzido, solução definitiva na fase indicada; **Pendente (Fn)** = fica para a fase n.

## 1. Itens da missão

| # | Sev. | Local | Problema | Situação |
|---|---|---|---|---|
| 1 | Crítica | `AuthModal.tsx` | Botões "Entrar como Gestor/Sócio" entravam ou **criavam** a conta do super admin com uma senha fixa fraca escrita no código e uma conta demo também com senha fixa; a conta demo ainda gravava um sócio já aprovado | **Corrigido (F0)**: demo e senhas removidos; login por senha removido; entrada só por Google ou link mágico. Varredura (`npm run scan:secrets`) confirma zero ocorrência no código e no `dist/` |
| 2 | Crítica | `firestore.rules` (`members` → `allow get`), `App.tsx` | Qualquer pessoa sem login lia o documento completo do sócio aprovado (CPF, nascimento, e-mail, telefone, foto) sabendo o ID, que ia no QR | **Corrigido (F0)**: leitura pública removida. O QR lê `publicCards/{id}` (nome reduzido, categoria, situação, validade), gravado só pela diretoria. Teste: "anônimo não lê sócio aprovado" |
| 3 | Crítica | `firestore.rules` (`isBootstrappedAdmin`, `isAdmin`), `AuthContext.tsx`, `AdminManagementView.tsx` | Super admin por e-mail fixo no código e nas regras, sem exigir `email_verified`; admin resolvido por ID igual ao e-mail (na prática só o e-mail fixo funcionava nas regras) | **Corrigido (F0)**: e-mail fixo removido de todo lugar. Papel vem de `admins/{chave do e-mail}` com `email_verified == true`; superadmin por `role` no documento ou claim `superadmin`, criado pelo `scripts/grant-superadmin.mjs`. Teste: "e-mail antigo não tem poder nenhum" |
| 4 | Crítica | `App.tsx`, `DigitalCard.tsx`, `VerificationModal.tsx` | O `token` do QR nunca era conferido; a validação olhava só o ID e calculava tudo no navegador | **Contido (F0)**: QR não leva mais token falso; a portaria vê só a situação real gravada pela diretoria. **Pendente (F3)**: token aleatório de 32 bytes, guardado como hash, conferido por Function com rate limit, rotativo a cada 60 s |
| 5 | Alta | `security.ts`, `MemberDashboard.tsx` | Token gerado com `Math.random` pelo próprio sócio; validade de 24 h dependia do relógio do aparelho | **Contido (F0)**: gerador trocado por `crypto.getRandomValues` e o selo deixou de valer como prova (texto da carteirinha e da validação ajustados). **Pendente (F3)**: emissão e expiração no servidor |
| 6 | Alta | `security.ts` (`saveOfflineCard`) | Carteirinha offline guardava o sócio completo, com CPF, em `localStorage`, sem assinatura; a tela dizia "LocalStorage Criptografado" | **Corrigido (F0)**: cópia guarda só nome, categoria, matrícula, foto, situação e validade; chave antiga (`_v1`) é apagada ao abrir o app e ao sair; logout limpa a cópia. **Pendente (F3)**: assinatura pelo servidor e aviso "última sincronização" |
| 7 | Alta | `firestore.rules` (`members` → `update`) | O sócio alterava `category`, `membershipNumber`, `renewalCount` e outros; só `status` e `validUntil` eram protegidos | **Corrigido (F0)**: listas explícitas com `affectedKeys().hasOnly()`: pendente/rejeitado corrige identificação; aprovado só contato, foto e selo; renovação só muda `status` para `pendente`. Criação exige `pendente`, `SÓCIO`, sem validade e sem matrícula. Testes cobrem cada campo |
| 8 | Alta | `firestore.rules` (`admins`, `notifications`, `emailDispatches`, `systemSettings`) | Qualquer logado listava admins e e-mails, criava notificação para qualquer pessoa e forjava registro de e-mail | **Corrigido (F0)**: admins só o próprio registro (lista e escrita só superadmin, chave conferida com o e-mail); notificação de terceiros só pela diretoria; `emailDispatches` e `systemSettings` só diretoria. **Pendente (F1)**: criação dessas coleções só por Function, por tenant |
| 9 | Alta | `firebase-applet-config.json` | Projeto e banco criados pelo AI Studio, sem dev/prod separados e sem região escolhida | **Decidido com a dona do projeto**: o projeto atual continua sendo a produção (os dados estão lá); dev no Emulator Suite; staging depois. A região do banco atual não pode mais ser mudada (registrado em `docs/architecture.md` na F1) |
| 10 | Média | `AdminDashboard.tsx`, `RejectionEmailConfig.tsx` | E-mail de rejeição só gravava registro com status `enviado`; nada era enviado | **Contido (F0)**: o registro agora diz `pendente` e a tela não promete envio. **Pendente (F4)**: envio real pelo Resend com status real |
| 11 | Média | `pushNotification.ts` | "Push" era só notificação local; a função marcava permissão como concedida mesmo quando o navegador negava | **Contido (F0)**: a tela mostra a permissão real do navegador. **Pendente (F4)**: FCM |
| 12 | Média | Fotos e logos | Base64 dentro do Firestore (até 2,5 MB, acima do limite de 1 MiB do documento); fotos do Unsplash no código, inclusive como foto padrão da carteirinha | **Corrigido (F0)**: fotos do Unsplash removidas (galerias de "avatares de teste" excluídas; sem foto, fica vazio). Limite de 900 kB nas regras. **Pendente (F3)**: Storage com validação de tipo real, remoção de EXIF e redimensionamento |
| 13 | Média | `firebase/config.ts` | `handleFirestoreError` registrava e lançava uid, e-mail e provedores do usuário; o JSON aparecia em `alert` | **Corrigido (F0)**: erro sem dado pessoal, mensagem curta em português, log só em desenvolvimento. `testConnection` removido |
| 14 | Média | `AdminDashboard.tsx` | CSV com CPF completo, sem escape, sem proteção contra fórmula, sem auditoria; gerador de sócios falsos; `DEFAULT_OFFICIAL_EXPIRY` fixa em 31/10/2027 | **Corrigido (F0)**: CSV com `;`, aspas escapadas, neutralização de `= + - @`, CPF mascarado, confirmação e registro obrigatório em `auditLogs` (sem registro, não exporta). Gerador de sócios removido. Validade = 12 meses a partir da aprovação (renovação soma 1 ano). **Pendente (F2)**: regra de validade por sociedade |
| 15 | Baixa | Geral | Sem roteador, testes ou CI; dependências sem uso; `testConnection` em produção | **Parcial (F0)**: removidos `@google/genai`, `express`, `dotenv`, `esbuild`, `tsx`, `autoprefixer`, `@types/express` (o `npm install` voltou a funcionar sem `--legacy-peer-deps`); testes de regras com Vitest + emulador. **Pendente (F1)**: roteador, ESLint, CI, Dependabot |

## 2. Achados adicionais

| # | Sev. | Local | Problema | Situação |
|---|---|---|---|---|
| A1 | Crítica | `MemberDashboard.tsx` | Botões "Testar Carteirinha (SÓCIO/DIRETORIA)" e "Aprovar este cadastro imediatamente (Modo Demonstração)" gravavam o próprio sócio como `aprovado`, com CPF fixo e foto do Unsplash | **Corrigido (F0)**: removidos; as regras também barram |
| A2 | Alta | `MemberDashboard.tsx` | Botão "Alternar para Diretoria": o sócio trocava a própria categoria para MEMBRO DA DIRETORIA | **Corrigido (F0)**: removido; regra barra |
| A3 | Alta | `MemberRegistrationForm.tsx` | O cliente definia `status`, `category` ("Sócio Efetivo Contribuinte"), `membershipNumber` aleatório e `validUntil` | **Corrigido (F0)**: categoria e matrícula só pela diretoria (matrícula sequencial na aprovação); validade vazia até a aprovação |
| A4 | Média | `MemberRegistrationForm.tsx` | `lgpdConsentDate` era sobrescrito a cada edição, apagando a data real do consentimento | **Corrigido (F0)** |
| A5 | Média | `AdminManagementView.tsx` | Tela de gestores não exigia superadmin; mostrava o e-mail pessoal do super admin | **Corrigido (F0)** |
| A6 | Média | `AuthContext.tsx` | O app escutava a coleção `admins` inteira em todo login (lista de e-mails para qualquer um) | **Corrigido (F0)**: cada um escuta só o próprio registro; só o superadmin lista |
| A7 | Média | `AuthContext.tsx` / `AdminCardCustomizer.tsx` | `saveActiveTemplate` engolia o erro e a tela dizia "Salvo com sucesso" mesmo sem gravar | **Corrigido (F0)**: o erro sobe e a tela avisa |
| A8 | Média | `MemberDashboard.tsx`, `EditMemberProfileModal.tsx` | Hooks depois de `return` condicional (viola as regras do React; pode quebrar a tela ao mudar de estado) | **Corrigido (F0)** no painel do sócio. **Pendente (F1)**: ESLint `rules-of-hooks` em todo o código |
| A9 | Média | `RejectMemberModal.tsx` | E-mail de ajuste levava o CPF completo, embora a tag dissesse "mascarado" | **Corrigido (F0)**: sempre mascarado |
| A10 | Média | `DigitalCard.tsx`, `MemberRegistrationForm.tsx`, `AdminDashboard.tsx`, `MemberDashboard.tsx`, `App.tsx` | Promessas falsas: "Assinatura Digital Certificada ICP-Brasil", "dados criptografados", "100% Homologados", "LocalStorage Criptografado", "Zero-Trust" | **Corrigido (F0)**: textos trocados pelo que é verdade; o painel LGPD mostra a contagem real de consentimentos |
| A11 | Média | `defaultTemplates.ts` | CNPJ fictício `12.345.678/0001-90` e `showCpf: true` por padrão | **Corrigido (F0)**: CNPJ removido; CPF desligado por padrão na carteirinha |
| A12 | Média | `AdminDashboard.tsx` | Exclusão "LGPD" apagava só `members`, deixando notificações, registros de e-mail e a projeção pública | **Parcial (F0)**: apaga também `publicCards`. **Pendente (F4)**: fluxo completo do titular, com retenção legal |
| A13 | Média | `AdminDashboard.tsx` | Lê a coleção `members` inteira, sem paginação | **Pendente (F3)**: paginação por cursor e agregados |
| A14 | Baixa | `MemberDashboard.tsx`, `RejectionEmailConfig.tsx` | Remetente fixo `diretoria@associacao.org.br` exibido como se fosse real | **Corrigido (F0)** |
| A15 | Baixa | `RejectionEmailConfig.tsx`, `AdminCardCustomizer.tsx` | Exemplos de pré-visualização com nome, CPF e e-mail realistas | **Corrigido (F0)**: marcadores "exemplo" |
| A16 | Baixa | `logoColorExtractor.ts`, uploads | SVG aceito sem sanitização e `crossOrigin` em URL externa informada pelo admin | **Pendente (F3)**: upload só PNG/JPEG/WebP validados no servidor |
| A17 | Baixa | `App.tsx` | Validação de QR mostrava CPF mascarado; agora nada de CPF | **Corrigido (F0)** |
| A18 | Info | Login | Contas que entravam com senha passam a entrar pelo link mágico (mesmo e-mail, mesma conta) | **Ação no console**: ativar "E-mail/link (login sem senha)" em Authentication → Método de login, e desativar "E-mail/senha" |

## 3. Publicação

A fase 0 não foi publicada isoladamente: ela foi substituída pelo modelo multi-tenant das fases seguintes. A ordem segura de publicação (backup, segredos, Functions, regras, site, master, migração) está em `docs/firebase-setup.md`. O script `grant-superadmin.mjs` da fase 0 foi removido; o papel agora vem da membership por sociedade e o master por `functions/scripts/grant-master.mjs`.

## 3.1 Situação dos itens pendentes depois das fases 1 a 9

| Item | Situação |
|---|---|
| 4, 5 Token do QR | **Corrigido:** `card.issue` gera 32 bytes aleatórios no servidor, guarda só o SHA-256, expira em 90 s (tela) ou 24 h (download); `card.verify` confere a situação atual (suspensão vale na hora). Testes em `tests/ops/card.test.ts`. |
| 6 Offline assinado | **Parcial:** cópia mínima sem CPF, com "última sincronização"; a validade continua sendo provada só pelo QR do servidor. |
| 8 Criação só pelo servidor | **Corrigido:** escrita do cliente negada em tudo sob `tenants/`; testes de isolamento por coleção em `tests/rules/tenant-isolation.test.ts`. |
| 10 E-mail real | **Corrigido:** Resend com status real no outbox; sem chave, fica "simulado" e o link aparece para quem convidou. |
| 11 Push | **Pendente:** registrado no outbox; envio FCM a implementar. |
| 12 Storage | **Corrigido:** fotos no Storage privado, redimensionadas no navegador (remove EXIF), tipo real conferido no servidor (`uploadGuard`). |
| 14 Validade por regra | **Corrigido:** validade em meses por sociedade (`settings.validityMonths`). |
| 15 Roteador, CI, testes | **Corrigido:** React Router com lazy loading, CI no GitHub Actions, ESLint, 103 testes de operações e 100 de regras. |
| A12 Exclusão LGPD | **Corrigido:** pedidos do titular, exportação dos próprios dados, anonimização com retenção legal e rotina automática. |
| A13 Paginação | **Parcial:** listas com limite e cursor; relatórios financeiros ainda carregam o livro do período no navegador. |
| A16 SVG/upload | **Corrigido:** só JPEG, PNG, WebP e PDF, conferidos pelos bytes. |

## 4. Como verificar

- `npm run typecheck` e `npm run build`
- `npm run test:rules`: 16 testes das regras no emulador (precisa de Java)
- `npm run scan:secrets` depois do build: varre `src/`, `dist/`, `scripts/` e as regras
