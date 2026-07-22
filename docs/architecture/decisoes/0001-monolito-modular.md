# ADR 0001 - Monólito modular

**Status:** aceito para o MVP.

## Decisão

Usar uma aplicação backend única, dividida em módulos de domínio e acompanhada por workers do mesmo repositório.

## Motivo

O produto ainda valida regras, operação e volume. Microserviços aumentariam consistência distribuída, observabilidade e custo operacional sem evidência de necessidade.

## Consequências

Fronteiras, eventos e dependências entre módulos serão explícitos. Um módulo só será extraído quando métricas mostrarem necessidade de escala, isolamento ou ciclo de entrega independente.
