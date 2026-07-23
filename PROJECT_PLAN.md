# Plano do projeto

## Objetivo

Entregar um MVP regional, seguro e demonstrável, capaz de validar a aquisição de clientes e prestadores antes de ativar integrações reguladas ou expansão nacional.

## Fases e gates

| Fase | Entrega | Gate de saída |
|---|---|---|
| 0 - Descoberta | requisitos, contradições, auditoria da referência e arquitetura | decisões críticas classificadas; sem pendência silenciosa |
| 1 - Fundação | monorepo, API, PostgreSQL, migrations, autenticação, sessões, RLS, auditoria e testes | banco recriado do zero; testes negativos de autorização verdes |
| 2 - Experiência | design system, landing, cadastro, login, onboarding e layouts por perfil | WCAG 2.2 AA; 360, 390, 768 e 1440 px validados |
| 3 - Marketplace | solicitações, propostas, chat, agenda, estados e avaliações | jornada cliente-prestador executada ponta a ponta |
| 4 - Operação | parceiros, QR Code, moderação e administração | ações críticas justificadas e auditadas |
| 5 - Financeiro sandbox | interface PSP, webhook assinado fake, split e ledger | idempotência e reconciliação testadas; nenhum dinheiro real |
| 6 - Prontidão | segurança, desempenho, acessibilidade e documentação | checklist de produção aprovado por responsáveis técnico, jurídico e financeiro |

## Hipóteses de trabalho

- marca provisória: Max Service;
- piloto: uma região limitada do interior de São Paulo;
- catálogo piloto: eletricista, encanador, pedreiro, pintor, diarista e montagem/reparos;
- comissão de demonstração: plataforma 12%, parceiro 2% e cashback 2%;
- PSP sandbox com split; sem custódia pela Max Service;
- aprovação manual de prestador após validações sintáticas e documentais.

## Progresso implementado

- Fases 1 e 3 possuem jornadas persistentes demonstráveis no Docker local.
- A Fase 4 já inclui rede do parceiro, captura pública por link/QR com consentimento, triagem operacional de indicações, fila de ocorrências e moderação manual de profissionais com checklist e auditoria.
- A Fase 5 possui a fundação sandbox: regra 12/2/2 versionada, snapshot por booking, eventos assinados, idempotência, split, ledger e reconciliação sem PSP real.
- A prontidão de identidade já possui sessão demonstrativa opaca, expiração de quatro horas, revogação persistente, cookie `HttpOnly`/`SameSite=Strict`, bloqueio entre perfis e contexto BFF→API assinado.
- A verificação possui cofre S3 local para documentos sintéticos, versões append-only, validação de assinatura/MIME/tamanho, hash SHA-256, download privado e auditoria por ator.
- A solicitação de serviço aceita até três imagens sintéticas privadas, com limite compatível com a borda local, hash, RLS, auditoria e visualização pelo profissional autorizado.
- A conversa transacional aceita uma imagem sintética privada por mensagem, com legenda opcional, validação de conteúdo, hash, isolamento entre membros e auditoria de envio/download.
- Mensagens, lista de conversas e contadores possuem sincronização adaptativa; o backend entrega apenas mensagens posteriores ao cursor validado na própria conversa e mantém um cursor de leitura monotônico por membro para calcular não lidas.
- Autenticação real, confirmação de contato, processamento antimalware e integrações reguladas continuam condicionados aos gates das fases seguintes.

## Não objetivos do MVP

Carteira, conta de pagamento, PIX operado pela empresa, custódia, crédito, investimento de cashback, biometria facial, antecedentes automatizados, orçamento por IA, categorias reguladas, iOS nativo e expansão nacional.

## Critérios de qualidade permanentes

- sem segredos versionados;
- dados sintéticos;
- valores monetários em decimal e horários em UTC;
- autorização no backend e isolamento testado;
- uploads privados e URLs temporárias;
- feature flags para integrações de risco;
- lint, typecheck, build, testes e scanner de segredos no CI.
