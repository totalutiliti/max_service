# Proteção contra abuso

## Escopo materializado

O middleware de rate limit roda na API somente depois da validação da assinatura BFF→API. Assim, cabeçalhos de papel ou ator enviados diretamente pelo cliente não criam chaves confiáveis nem contornam a fronteira interna.

As políticas locais protegem:

| Superfície | Escopo | Limite |
|---|---|---:|
| criação de sessão demonstrativa | réplica | 60/min |
| consulta pública de indicação | réplica | 300/min |
| consulta pública de indicação | convite | 60/min |
| captura pública de indicação | réplica | 60/min |
| captura pública de indicação | convite | 5/10 min |
| validação de cupom | réplica | 300/min |
| validação de cupom | cliente | 30/min |
| recusas de cupom | cliente persistente | 10/15 min |

Uma requisição permitida recebe `RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset`. Ao atingir o limite, a API responde `429`, `Retry-After`, `cache-control: no-store` e o código estável `RATE_LIMITED`. O BFF preserva esses cabeçalhos e o `x-request-id`.

## Privacidade e contenção

- convite e ator servem somente como entrada de HMAC com salt aleatório por processo;
- nenhum IP, contato, código de convite, cookie, token ou ID de ator é guardado no bucket;
- buckets são limitados a 2.000 e eventos de bloqueio a 1.000;
- buckets expirados são removidos e o mais antigo é descartado quando a capacidade é atingida;
- o cockpit da Operação expõe apenas contagens e nomes fechados de políticas;
- respostas `429` entram na telemetria agregada, sem ampliar o schema de logs.
- tentativas de cupom persistem somente SHA-256 do código normalizado, contexto mínimo e resultado; o código bruto nunca entra no monitor;
- o relatório de campanhas mostra contagens de 24 horas e níveis de atenção sem expor identificadores de cliente e sem tomar decisão automática.
- a publicidade usa apenas categoria/região do pedido corrente; entregas guardam token com hash, não guardam identidade bruta e só podem apontar para destino HTTPS previamente moderado;
- anunciante consulta somente métricas agregadas; aprovação, pausa e reativação exigem Operação, justificativa e auditoria.

## Limite da etapa

A implementação atual existe para o piloto local e é independente por processo. Reinício zera os contadores e duas réplicas não compartilham estado. A autenticação demonstrativa também não representa contas individuais reais, portanto usa um limite global.

Produção exige store distribuído de baixa latência para os limites de borda, chaves por IP/conta definidas na fronteira confiável, proteção contra indisponibilidade do store, limites homologados por carga, retenção aprovada para eventos de campanha e publicidade, bloqueio de destinos maliciosos, desafios progressivos, alertas e runbook. A evidência local não altera `productionAuthorized: false`.
