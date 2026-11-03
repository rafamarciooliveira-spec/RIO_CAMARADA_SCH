# Inventário de dados tratados (ROPA)

Papéis: cada **sociedade = controladora**; **plataforma = operadora**. TODO(JURÍDICO): revisar bases legais e prazos.

| Processo | Dados | Titulares | Finalidade | Base legal (proposta) | Onde fica | Quem acessa | Retenção |
|---|---|---|---|---|---|---|---|
| Cadastro de sócio | nome, categoria, situação, matrícula, foto (opcional), mês/dia de nascimento | sócios e dependentes | vínculo associativo, carteirinha | execução de contrato (art. 7º V) | `members/{id}` | diretoria com papel "sócios"; o próprio | enquanto sócio + prazo de inativos (padrão 5 anos), depois anonimiza |
| Dados pessoais privados | CPF (cifrado), nascimento, e-mail, telefone, endereço | sócios | identificação, contato, deduplicação | execução de contrato; legítimo interesse (contato) | `members/{id}/private/pii` | papel "dados pessoais"; o próprio | idem |
| Menores | dados acima + responsável legal | crianças e adolescentes | participação em grupos | consentimento do responsável (art. 14) | idem | idem | idem |
| Uso de imagem | foto, imagens de eventos | sócios | divulgação | consentimento (opcional, separado) | Storage privado | diretoria | até revogação |
| Comunicação | e-mail, preferências | sócios | avisos da sociedade | legítimo interesse, com opção de sair | `pii`, `outbox` (só hash do e-mail) | sistema | 1 ano (registro de envio) |
| Marketing | e-mail | sócios | ofertas de parceiros | consentimento (opcional) | `pii.consents` | diretoria | até revogação |
| Financeiro | cobranças, pagamentos, recibos, lançamentos | sócios, fornecedores | gestão financeira, prestação de contas | obrigação legal; execução de contrato | `charges`, `ledger` | tesouraria, conselho fiscal; o próprio (suas cobranças) | mínimo legal (padrão 5 anos) |
| Portaria | check-ins (id do sócio, nome reduzido, resultado) | sócios | controle de acesso | legítimo interesse | `checkins` | portaria, diretoria | 1 ano (TODO: definir) |
| Votações | quem votou (sem o voto), voto sem identificação | sócios | eleições e deliberações | execução de contrato (estatuto) | `voters`, `ballots` | diretoria (só contagem) | conforme estatuto |
| Atas | nomes de presentes e signatários | sócios | registro societário | obrigação legal | `minutes`, `assemblies` | diretoria; sócios quando publicada | permanente |
| Auditoria | ids de quem fez o quê (sem PII em texto) | usuários | segurança | legítimo interesse | `audit` | papel auditoria | 5 anos |
| Contas de acesso | e-mail, nome, uid | usuários | autenticação | execução de contrato | Firebase Authentication | sistema | enquanto ativo |

Suboperadores: Google Cloud/Firebase (hospedagem, banco, arquivos, funções), Resend (e-mail transacional), provedor de
pagamento (quando escolhido). TODO(JURÍDICO): transferência internacional e cláusulas contratuais.
