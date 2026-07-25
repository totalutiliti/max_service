# Proteção contra abuso

## Escopo materializado

O middleware de rate limit roda na API somente depois da validação da assinatura BFF→API. Assim, cabeçalhos de papel ou ator enviados diretamente pelo cliente não criam chaves confiáveis nem contornam a fronteira interna.

As políticas coordenadas protegem:

| Superfície | Escopo | Limite |
|---|---|---:|
| criação de sessão demonstrativa | global distribuído | 60/min |
| consulta pública de indicação | global distribuído | 300/min |
| consulta pública de indicação | convite | 60/min |
| captura pública de indicação | global distribuído | 60/min |
| captura pública de indicação | convite | 5/10 min |
| validação de cupom | global distribuído | 300/min |
| validação de cupom | cliente | 30/min |
| recusas de cupom | cliente persistente | 10/15 min |

Uma requisição permitida recebe `RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset`. Ao atingir o limite, a API responde `429`, `Retry-After`, `cache-control: no-store` e o código estável `RATE_LIMITED`. O BFF preserva esses cabeçalhos e o `x-request-id`.

## Privacidade e contenção

- convite e ator servem somente como entrada de HMAC-SHA-256 com chave compartilhada exclusiva do ambiente;
- nenhum IP, contato, código de convite, cookie, token ou ID de ator é guardado no bucket;
- o Redis recebe apenas política e digest opaco, usa janela móvel atômica e expira cada contador automaticamente;
- observações locais de buckets são limitadas a 2.000 e eventos agregados de bloqueio a 1.000;
- o cockpit da Operação expõe apenas contagens e nomes fechados de políticas;
- respostas `429` entram na telemetria agregada, sem ampliar o schema de logs.
- tentativas de cupom persistem somente SHA-256 do código normalizado, contexto mínimo e resultado; o código bruto nunca entra no monitor;
- o relatório de campanhas mostra contagens de 24 horas e níveis de atenção sem expor identificadores de cliente e sem tomar decisão automática.
- a publicidade usa apenas categoria/região do pedido corrente; entregas guardam token com hash, não guardam identidade bruta e só podem apontar para destino HTTPS previamente moderado;
- anunciante consulta somente métricas agregadas; aprovação, pausa e reativação exigem Operação, justificativa e auditoria.

## Modos e falha segura

O Docker local usa `RATE_LIMIT_STORE_MODE=redis`: duas réplicas da API consultam os mesmos contadores atômicos. A chave HMAC precisa ter ao menos 32 caracteres e a URL do Redis nunca aparece em respostas ou logs. O readiness valida `PING` com tempo limite; perda ou configuração inválida do Redis deixa o check crítico e as superfícies protegidas respondem `503 RATE_LIMIT_STORE_UNAVAILABLE`, sem cair silenciosamente para memória.

`RATE_LIMIT_STORE_MODE=memory` continua disponível somente para desenvolvimento isolado. Nesse modo, reinício zera os contadores, réplicas não compartilham estado e o cockpit marca um bloqueador de produção.

Produção ainda exige Redis gerenciado com TLS/ACL, segredo em cofre, limites homologados por carga, chaves por IP/conta definidas na fronteira confiável, proteção também na borda, retenção aprovada para eventos de campanha e publicidade, bloqueio de destinos maliciosos, desafios progressivos, alertas e runbook. A evidência local não altera `productionAuthorized: false`.
