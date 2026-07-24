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

## Ainda obrigatório antes de produção

- cadastro e confirmação de e-mail/telefone;
- senha com Argon2id e pepper em cofre, ou provedor OIDC homologado;
- recuperação de conta resistente a enumeração e tomada de conta;
- MFA obrigatório para operação/administração;
- o piloto local já limita globalmente a criação de sessão demonstrativa; produção ainda exige rate limit distribuído por IP/conta, lockout progressivo, detecção de reuso e alertas;
- rotação de chaves, inventário de sessões/dispositivos e revogação global;
- política de retenção, consentimentos, termos e revisão de privacidade/LGPD;
- repetir o E2E já automatizado em HTTPS, proxy real e múltiplas réplicas.
