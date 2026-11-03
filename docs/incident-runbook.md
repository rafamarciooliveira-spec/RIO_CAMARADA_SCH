# Plano de resposta a incidentes de segurança e dados pessoais

TODO(JURÍDICO): validar prazos e modelos de comunicação com assessoria jurídica (Resolução CD/ANPD nº 15/2024).

## 1. Detecção (qualquer pessoa)
Sinais: acesso estranho na auditoria (`tenants/{t}/audit`), exportações fora do normal, alertas do Cloud Logging,
picos em `rateLimits`, relato de sócio, chave ou segredo exposto. Registrar na hora: quem viu, quando, o quê.

## 2. Contenção (primeiras horas)
- Segredo vazado: girar no Secret Manager (`firebase functions:secrets:set ...`) e publicar as functions de novo.
  Chave do CPF: girar exige recifrar (script de rotação) e invalida o índice cego antigo.
- Conta comprometida: desativar no Firebase Authentication; remover a membership (revogação imediata).
- Sociedade sob ataque: suspender pelo painel master (bloqueia uso e validação).
- Abuso de API: endurecer limites nas ops, ligar App Check obrigatório (`ENFORCE_APP_CHECK=true`).
- Preservar evidências: exportar auditoria e logs do período antes de qualquer limpeza.

## 3. Avaliação
Quais dados, quantos titulares, quais sociedades, se havia CPF (cifrado?), menores, dados financeiros. Risco ou dano
relevante aos titulares? A plataforma é operadora: avisar a(s) sociedade(s) controladora(s) imediatamente.

## 4. Comunicação
- À sociedade controladora: imediata, com o que se sabe.
- À ANPD e aos titulares: pela controladora, em até 3 dias úteis quando houver risco ou dano relevante
  (TODO(JURÍDICO): confirmar prazo e formulário vigentes), com natureza dos dados, titulares afetados, medidas tomadas e riscos.
- Texto simples, sem jargão; canal: e-mail e aviso no portal.

## 5. Registro e lições
Registrar o incidente (data, descoberta, causa, dados, decisões, comunicações) e guardar por 5 anos.
Corrigir a causa, acrescentar teste automatizado que impeça a repetição e revisar este plano.

## Contatos
TODO(JURÍDICO): encarregado (DPO) da operadora; responsáveis técnicos; contato de cada sociedade (cadastrado no painel master).
