# Requisitos extraídos

## Problema e proposta

Clientes têm dificuldade para localizar profissionais confiáveis e próximos; prestadores enfrentam demanda irregular. A Max Service deve reduzir a fricção da descoberta, comparação, conversa e contratação sem assumir funções financeiras ou de verificação para as quais não esteja autorizada.

## Atores

Cliente, prestador, parceiro comercial, anunciante, administrador, operação/moderação, financeiro e suporte.

## Jornada central

1. Cadastro, confirmação de contato, aceite versionado e onboarding progressivo.
2. Cliente informa categoria, local, descrição, fotos, medidas e disponibilidade.
3. Prestadores elegíveis recebem a oportunidade e enviam propostas.
4. Cliente compara preço, distância, perfil e avaliações.
5. Conversa, agendamento e ciclo de status ficam vinculados à solicitação.
6. PSP processa pagamento e informa resultado por webhook assinado e idempotente.
7. Comissões e cashback são registrados por regra versionada.
8. Partes avaliam a experiência; operação trata cancelamentos, ocorrências e disputas.

## Capacidades P0

- landing, cadastro, login e recuperação;
- perfis de cliente e prestador;
- catálogo administrável e geografia regional;
- busca, solicitação, propostas, chat e agendamento;
- estados auditáveis e cancelamento com motivo;
- avaliações e notificações;
- indicação por link/QR e vínculo prestador-parceiro;
- painel básico do parceiro e administrativo;
- moderação manual e upload seguro;
- e-mails transacionais, auditoria, seeds sintéticos e testes.

## Requisitos de experiência

Mobile-first; botões grandes; um objetivo principal por tela; textos diretos; feedback imediato; retomada de progresso; boa experiência em conexão lenta; categorias visuais; navegação previsível; foco visível e contraste AA.

## Requisitos não funcionais

API versionada, PostgreSQL, migrations, RLS fail-closed, IDs não previsíveis, sessões revogáveis, Argon2id, rate limit, CSP, CORS restritivo, validação de entrada, uploads privados, auditoria append-only, idempotência, filas, observabilidade, backup/restauração e LGPD por padrão.
