# Sodalis

Plataforma multi-tenant e white-label para sociedades culturais (canto, ginástica, tiro, danças, música, clubes, grupos folclóricos e associações sem fins lucrativos): sócios, carteirinha digital com QR conferido pelo servidor, portaria, financeiro, eventos, plano de ação, atas e assembleias, votações secretas, módulos culturais e painel master. Nasceu do "Portal do Associado" gerado no Google AI Studio.

## Comece por aqui
- **O que fazer no Firebase:** `docs/firebase-setup.md` (passo a passo para publicar)
- **Testar no computador:** `docs/local-dev.md` (emulador com dados simulados)
- **Ver sem instalar nada:** abra `/ver-sistema` (demonstração com dados fictícios, só no navegador)
- **Arquitetura:** `docs/architecture.md` · **Servidor:** `docs/server.md` · **Permissões:** `docs/permissions.md`
- **Segurança:** `docs/security-audit.md` · **Incidentes:** `docs/incident-runbook.md` · **ROPA:** `docs/ropa.md` · **Minutas jurídicas:** `docs/legal/`
- **Publicar e reverter:** `docs/deploy.md` · **AI Studio:** `docs/ai-studio.md`

## Comandos

```bash
npm install
npm run dev            # http://localhost:3000 (aponta para o Firebase configurado)
npm run typecheck
npm run lint           # na primeira vez: npm run lint:install
npm test               # operações, regras de negócio, isolamento da demonstração, dados simulados
npm run test:rules     # regras do Firestore e do Storage no emulador (precisa de Java 21)
npm run build
npm run scan:secrets
npm run functions:build
```

## Rotas
- `/` landing · `/ver-sistema` demonstração · `/master` painel da plataforma
- `/{slug}` portal da sociedade · `/{slug}/v/{token}` validação pública da carteirinha · `/{slug}/cadastro` proposta de sócio · `/{slug}/publico` página pública

## Regras de ouro
- O cliente nunca escreve no banco: toda escrita é uma operação no servidor (`src/shared/ops`), com validação, permissão, auditoria e limite de taxa.
- Nenhuma credencial, login demo ou e-mail administrativo no código (`npm run scan:secrets` confere).
- Marca e textos da plataforma num lugar só: `src/brand.ts`.
