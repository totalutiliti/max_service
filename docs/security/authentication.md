# Autenticação e sessões

## Implementado no piloto local

- a escolha de perfil cria um token opaco aleatório; somente o hash SHA-256 é persistido;
- o navegador recebe o token em cookie `HttpOnly`, `SameSite=Strict`, escopo `/` e validade máxima de quatro horas;
- toda rota privada do BFF resolve a sessão no backend e compara o perfil permitido antes de chamar a API;
- o contexto de ator entre BFF e API é assinado com HMAC, vinculado a timestamp, método, caminho, papel e UUID;
- cabeçalhos de ator enviados diretamente à API, assinatura vencida e troca de papel/caminho são rejeitados;
- trocar de perfil revoga a sessão anterior; sair revoga a sessão atual; sessões expiradas ou revogadas retornam `401`;
- o E2E local confirma logout, retorno à tela de acesso e permanência da revogação após recarregar;
- identidade, papel, hash, validade e criação são imutáveis no banco; revogação é irreversível;
- mutações com `Origin` externo são bloqueadas e dados privados continuam sujeitos à RLS;
- tokens nunca são devolvidos em JSON ao navegador nem registrados em logs.

As chaves do Compose são exclusivas do ambiente local. `COOKIE_SECURE=false` existe somente porque a demonstração usa HTTP em `127.0.0.1`; qualquer ambiente HTTPS deve definir `COOKIE_SECURE=true` e provisionar segredos fora do repositório.

## Fundação de produção adicionada

A migration `0057` e os contratos de runtime adicionam uma base separada para
identidade real: conta verificada, sessão opaca, validade absoluta e por inatividade,
rotação encadeada, detecção de reuso, inventário, revogação atual/global, MFA
obrigatório para Operação, auditoria sanitizada e RLS.

Essa base permanece desabilitada e falha fechado. Ela não escolhe nem simula um
provedor. Não existe rota pública capaz de emitir uma sessão a partir de dados
declarados pelo navegador. Consulte:

- [ADR 0005 — Estratégia de identidade de produção](../architecture/decisoes/0005-identidade-de-producao.md);
- [Fundação de identidade de produção](production-identity-foundation.md).

## Ainda obrigatório antes de produção

- decidir e homologar credencial local, OIDC gerenciado ou estratégia híbrida;
- cadastro e confirmação reais de e-mail/telefone;
- recuperação de conta resistente a enumeração e tomada de conta;
- implementação real de MFA e step-up para Operação/administração;
- conectar o lockout progressivo ao adaptador e adicionar proteção por IP/conta na
  borda;
- notificações, rotação de chaves e resposta a incidentes;
- política de retenção, consentimentos, termos e revisão de privacidade/LGPD;
- repetir os testes em HTTPS, proxy real e múltiplas réplicas.
