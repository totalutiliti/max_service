# ADR 0003 - Protótipo web local

**Status:** aceito para esta etapa.

## Contexto

O diretório de destino estava vazio e a validação visual precisa começar antes da fundação transacional completa.

## Decisão

Criar uma casca web local com dados sintéticos, sem autenticação própria ou persistência de produção. Ela valida identidade, linguagem e jornada; não substitui a arquitetura alvo Next.js BFF + NestJS + PostgreSQL.

## Restrições

Nenhum deploy, conta, pagamento real ou dado pessoal. A integração backend só começa após revisão da Fase 0.
