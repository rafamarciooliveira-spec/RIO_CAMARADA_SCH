# Matriz de permissões padrão

Gerado de `src/shared/modules.ts` por `node scripts/gen-permissions-doc.mts`. Cada sociedade pode editar os papéis em Configurações > Papéis e pessoas.
Ações: v = ver, c = criar, e = editar, a = aprovar, x = exportar. O sócio sempre vê os próprios dados (carteirinha, cobranças, perfil) sem precisar de permissão de módulo.

| Módulo | Presidente | Vice-presidente | Tesoureiro(a) | Secretário(a) | Conselho fiscal | Diretor(a) de eventos e cultura | Portaria | Sócio(a) |
|---|---|---|---|---|---|---|---|---|
| Sociedade e identidade | vceax | vceax | v | v | v | v | – | – |
| Papéis e convites | vceax | vceax | – | vc | – | – | – | – |
| Sócios | vceax | vceax | vx | vceax | v | v | – | – |
| Dados pessoais (CPF) | vceax | vceax | – | v | – | – | – | – |
| Carteirinha | vceax | vceax | v | vceax | v | v | – | – |
| Portaria | vceax | vceax | v | v | v | vc | vc | – |
| Avisos | vceax | vceax | v | vceax | v | vce | – | – |
| Agenda | vceax | vceax | v | vceax | v | vceax | – | – |
| Financeiro | vceax | vceax | vceax | v | vx | v | – | – |
| Eventos e projetos | vceax | vceax | ve | ve | v | vceax | v | – |
| Plano de ação | vceax | vceax | v | vceax | v | vceax | – | – |
| Atas e assembleias | vceax | vceax | v | vceax | v | v | – | – |
| Votações e eleições | vceax | vceax | v | vce | v | v | – | – |
| Grupos e oficinas | vceax | vceax | v | vceax | v | vceax | – | – |
| Reserva de espaços | vceax | vceax | vea | v | v | vceax | – | – |
| Patrimônio e acervo | vceax | vceax | v | v | v | vceax | – | – |
| Incentivos e editais | vceax | vceax | ve | v | v | vceax | – | – |
| Patrocinadores e benefícios | vceax | vceax | vceax | v | v | vce | – | – |
| Biblioteca de documentos | vceax | vceax | v | vceax | v | v | – | – |
| Gestões e mandatos | vceax | vceax | v | vceax | v | v | – | – |
| Engajamento | vceax | vceax | v | vceax | v | v | – | – |
| Notícias | vceax | vceax | v | vceax | v | vce | – | – |
| Competições e ranking | vceax | vceax | v | v | v | vceax | – | – |
| Organograma | vceax | vceax | v | vceax | v | v | – | – |
| Auditoria | vceax | vceax | – | – | v | – | – | – |

Master da plataforma: claim `master` concedida por script, MFA obrigatório; não vê dados pessoais. Acesso de suporte: leitura por até 8 h, com motivo, auditoria e aviso à diretoria.
