# Segurança HTTP

## Frontend

As páginas públicas, a demonstração, o convite e todas as rotas do BFF recebem:

- Content Security Policy com origens fechadas, bloqueio de objetos, frames e mídia;
- `frame-ancestors 'none'` e `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Cross-Origin-Opener-Policy: same-origin`;
- `Cross-Origin-Resource-Policy: same-origin`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` sem câmera, microfone, localização, pagamento ou USB;
- isolamento de agente e bloqueio de políticas legadas de cross-domain.

`/demo`, `/convite` e `/api/*` usam `private, no-store`. Assets públicos continuam livres para a estratégia restrita da PWA.

A aplicação atual usa estilos dinâmicos e a hidratação gera scripts inline; por compatibilidade, a CSP local ainda permite `unsafe-inline` em `script-src` e `style-src`. Produção exige nonce/hashes, remoção gradual de estilos inline e verificação no navegador alvo.

## API

Toda resposta da API, inclusive `401`, `413`, `429` e probes, recebe uma política ainda mais fechada: `default-src 'none'`, sandbox, bloqueio de frame, sniffing, cache e capacidades do navegador. O header `X-Powered-By` foi removido.

O parser JSON aceita no máximo 64 KB e o parser URL encoded 16 KB. Uploads binários não passam por esses parsers e mantêm os limites específicos já aplicados durante streaming: 512 KB para imagens e 2 MB para documentos.

CORS usa uma origem exata, métodos e cabeçalhos enumerados, não permite credenciais e expõe somente correlação, download e rate limit. O BFF permanece o canal normal de acesso.

## Transporte

HSTS só é emitido quando `TRANSPORT_SECURITY_CONFIGURED=true`. O Compose usa HTTP local e mantém a flag falsa, evitando declarar uma proteção inexistente. Em produção, a flag só pode ser habilitada depois de HTTPS, redirect HTTP→HTTPS, certificados, proxy confiável e domínio final estarem homologados.

O cockpit mostra **Transporte HTTPS** como gate de produção enquanto essa evidência externa não existir. Nenhuma configuração local altera `productionAuthorized: false`.
