# Fundação de identidade de produção

## Escopo entregue

A migration `0057_production_identity_foundation.sql` adiciona:

- estado de conta e data de verificação de contato;
- vínculo neutro entre usuário e sujeito de um provedor, armazenando apenas digest;
- estado persistente para falhas e bloqueio progressivo;
- desafios de verificação/recuperação persistidos somente por hash;
- famílias de sessões opacas com validade absoluta e por inatividade;
- rotação encadeada, revogação atual/global e detecção de reuso;
- eventos de segurança sem token, credencial, contato, IP ou cabeçalho bruto;
- RLS forçada, privilégios mínimos e invariantes irreversíveis no banco.

No runtime, a API fornece resolução, rotação, inventário e revogação de sessões. O
BFF mantém o token em cookie `__Host-ms_session`, `HttpOnly`, `Secure`,
`SameSite=Strict` e nunca o devolve no JSON. O contexto de ator continua sendo
assinado entre BFF e API.

## Fronteira de confiança

Somente um adaptador de identidade homologado poderá produzir um
`VerifiedIdentityPrincipal`. A fundação não expõe uma rota de emissão que receba
UUID, papel, contato verificado ou estado de MFA enviados pelo navegador.

O modo de produção aceita apenas UUIDs dinâmicos e rejeita os identificadores
fictícios conhecidos. Operação requer MFA tanto na regra de aplicação quanto na
constraint do banco.

## Política de sessão

Os três limites devem ser configurados explicitamente:

- `IDENTITY_SESSION_ABSOLUTE_MINUTES`: de 30 a 1.440 minutos;
- `IDENTITY_SESSION_IDLE_MINUTES`: de 5 minutos até o limite absoluto;
- `IDENTITY_SESSION_ROTATION_MINUTES`: de 5 minutos até o limite de inatividade.

O token opaco possui 256 bits aleatórios. Somente SHA-256 do token é persistido. O
reuso de um token já rotacionado revoga toda a família antes de retornar uma resposta
uniforme de sessão inválida.

## Proteções contra abuso

A fundação normaliza identificadores, produz digest HMAC-SHA-256 com segredo externo
e define bloqueio progressivo:

- 5 falhas: 60 segundos;
- 8 falhas: 15 minutos;
- 12 falhas: 24 horas.

As respostas públicas devem permanecer uniformes. O armazenamento do estado foi
preparado, mas a contagem só poderá ser conectada ao fluxo quando o adaptador de
autenticação real existir. Proteção distribuída por IP/conta na borda continua
obrigatória.

## O que não está implementado

- cadastro público e verificação real de e-mail/telefone;
- senha local, OIDC ou qualquer outro adaptador de autenticação;
- recuperação de conta e troca de credencial;
- MFA real e step-up;
- vinculação ou migração de identidades;
- notificações de segurança;
- coleta de dispositivo — deliberadamente ausente até revisão de privacidade;
- configuração de secrets, infraestrutura, CI/CD e observabilidade central.

Esses itens são bloqueadores de produção, não pendências cosméticas.

## Evidências exigidas para homologação

- migration dry-run em banco limpo e validação de drift;
- teste de RLS como role `max_service_app`;
- teste de emissão apenas por principal verificado;
- rotação, reuso, inventário, logout atual e logout global;
- MFA obrigatório para Operação;
- testes de enumeração, lockout, CSRF, proxy HTTPS e múltiplas réplicas;
- varredura de segredos, dependências e revisão do threat model.
