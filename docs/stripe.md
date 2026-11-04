# Stripe: como ligar o pagamento online da assinatura

O código já está pronto e **desligado**. Enquanto estiver desligado, a diretoria pede a troca de plano pela
tela "Plano e cobrança" e a plataforma aprova em Painel da plataforma > Pedidos de plano.

## Como a cobrança funciona

- Preço por sócio **titular** ativo, por mês. Dependentes não contam.
- Essencial: R$ 1,90 por titular, mínimo de R$ 69. Completo: R$ 2,90 por titular, mínimo de R$ 99.
- No Stripe, cada plano é um preço **por unidade** (R$ 1,90 ou R$ 2,90). A quantidade cobrada é o número de
  titulares, nunca menos que o mínimo (ex.: mínimo de R$ 99 ÷ R$ 2,90 = 35 unidades).
- Todo dia o servidor confere o número de titulares e atualiza a quantidade da assinatura (com ajuste proporcional).
- Plano anual: preço por unidade anual com 15% de desconto (R$ 1,90 × 12 × 0,85 = R$ 19,38 por titular, por ano).
- Filial de federação não paga sozinha: a federação é cobrada pela soma dos titulares de todas as filiais.

## Passo a passo (quando a conta existir)

1. Crie a conta em https://dashboard.stripe.com, com os dados da empresa e a conta bancária.
2. Em **Catálogo de produtos**, crie um produto por plano (Essencial, Completo) e, em cada um, dois preços
   recorrentes **por unidade**: mensal e anual. Copie os ids que começam com `price_`.
3. No Painel da plataforma > Planos, abra cada plano e cole os ids em "Stripe: preço mensal" e "preço anual".
4. Em **Desenvolvedores > Chaves de API**, copie a chave secreta (`sk_live_...`) e guarde no cofre do projeto:

   ```bash
   npx firebase functions:secrets:set STRIPE_SECRET_KEY --project prod
   ```

5. Em `functions/.env.prod`, acrescente a linha `STRIPE_ENABLED=true` e publique o servidor:

   ```bash
   npx firebase deploy --project prod --only functions
   ```

   Isso cria a função `stripeWebhook`. O endereço dela aparece no fim da publicação
   (`https://southamerica-east1-sodalis-5be4d.cloudfunctions.net/stripeWebhook`).
6. Em **Desenvolvedores > Webhooks**, adicione esse endereço com os eventos `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` e
   `invoice.payment_failed`. Copie o segredo de assinatura (`whsec_...`) e guarde:

   ```bash
   npx firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project prod
   npx firebase deploy --project prod --only functions
   ```

7. Em **Configurações > Portal do cliente**, ligue o portal (troca de cartão, faturas e cancelamento).

Pronto: na tela "Plano e cobrança" o botão vira "Ir para o pagamento", e o plano muda sozinho quando o Stripe
confirma. Teste primeiro com as chaves de teste (`sk_test_...`) e o cartão 4242 4242 4242 4242.

## Segurança

- A chave secreta e o segredo do webhook ficam só no Secret Manager; nunca no código ou no `.env`.
- O aviso do Stripe só é aceito com a assinatura conferida (HMAC-SHA256, tolerância de 5 minutos) e só pode
  gravar a assinatura da sociedade que veio no próprio pagamento.
- Ninguém lê os dados de cobrança direto do banco: a tela usa as operações do servidor.
