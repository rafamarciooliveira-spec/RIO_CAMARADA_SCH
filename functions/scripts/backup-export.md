# Backup antes da migração (e antes de qualquer mudança de regras em produção)

Rode **antes** de `migrate-v1.ts --commit`. O export não apaga nada e não altera o banco.

```bash
gcloud auth login
gcloud config set project ID-DO-PROJETO

# Bucket de backups (uma vez; mesma região do banco)
gcloud storage buckets create gs://ID-DO-PROJETO-backups --location=southamerica-east1 --uniform-bucket-level-access

# Export completo do banco usado pelo app (troque pelo id do banco; "(default)" se for o padrão)
gcloud firestore export gs://ID-DO-PROJETO-backups/$(date +%Y-%m-%d_%H%M)-antes-da-migracao \
  --database="ai-studio-e7712f00-a92c-4b42-8ebd-43a03dbf7abf"

# Acompanhar
gcloud firestore operations list --database="ai-studio-e7712f00-a92c-4b42-8ebd-43a03dbf7abf"
```

Para restaurar (num banco de teste primeiro, nunca direto em produção):

```bash
gcloud firestore import gs://ID-DO-PROJETO-backups/PASTA-DO-EXPORT --database="BANCO-DE-TESTE"
```

Recomendado também: ligar o PITR (recuperação para um ponto no tempo, 7 dias) no banco de produção:

```bash
gcloud firestore databases update --database="(default)" --enable-pitr
```
