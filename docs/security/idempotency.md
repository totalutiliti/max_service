# Idempotência das mutações

## Objetivo

Reenvios por timeout, perda de conexão ou clique repetido não podem criar pedidos, propostas, bookings, mensagens ou efeitos operacionais duplicados. A proteção transacional cobre:

- `POST /api/v1/service-requests`;
- `POST /api/v1/service-requests/:requestId/proposals`;
- `POST /api/v1/proposals/:proposalId/accept`;
- mensagens de texto em `POST /api/v1/conversations/:conversationId/messages`;
- abertura de caso em `POST /api/v1/partner/support/cases`;
- mensagens de texto do parceiro e da Operação em seus respectivos casos;
- triagem e transições de estado do atendimento pela Operação;
- atualização da jornada semanal e criação/liberação de bloqueios da agenda;
- transições, avaliações e cancelamentos do booking;
- notas e transições das ocorrências internas;
- triagem de indicações e verificação de profissionais, inclusive revisão documental;
- ativação, desativação e ordenação de categorias, regiões e bairros;
- criação e ativação/pausa de campanhas;
- atualização versionada das metas e dos gates de prontidão;
- imagens de solicitações de serviço;
- imagens anexadas às mensagens;
- arquivos da verificação de profissionais;
- anexos do atendimento de parceiros e da Operação.

## Contrato HTTP

O navegador cria uma `Idempotency-Key` opaca por tentativa de negócio e a reutiliza enquanto a mesma ação estiver pendente. A chave aceita de 16 a 80 caracteres alfanuméricos, hífen ou sublinhado.

O BFF valida a chave, inclui seu valor na assinatura HMAC do canal interno e a encaminha à API. Alterar a chave entre BFF e API invalida a assinatura. Nas rotas protegidas, chave ausente ou malformada retorna `400`.

Uma primeira execução confirmada retorna:

```http
Idempotency-Replayed: false
```

O mesmo ator, método, rota, chave e conteúdo recebem o mesmo corpo persistido, sem repetir o efeito:

```http
Idempotency-Replayed: true
```

Reutilizar a chave com outro conteúdo retorna `409`. O hash é calculado sobre JSON canônico, com chaves de objetos ordenadas; a ordem dos campos no transporte não altera a identidade da requisição.

## Garantia transacional

`api_idempotency_records` e a mutação de negócio participam da mesma transação PostgreSQL com o contexto RLS do ator:

1. a transação tenta reservar a combinação única de ator, método, rota e chave;
2. a vencedora executa a mutação e persiste a resposta antes do `COMMIT`;
3. uma concorrente aguarda a decisão da constraint única;
4. após o commit, a concorrente lê e devolve a resposta armazenada;
5. se a primeira transação falhar, a reserva e o efeito são revertidos juntos, permitindo que outra tentativa assuma a execução.

Isso evita a janela de falha existente em caches ou registros gravados fora da transação do negócio.

## Coordenação dos uploads privados

Nos quatro fluxos binários, o hash idempotente considera nome normalizado, MIME, tamanho, SHA-256 do conteúdo e legenda, quando aplicável. O identificador do registro e a chave do objeto são derivados deterministicamente do ator, rota, chave idempotente e tipo de efeito.

O objeto é enviado durante a mesma unidade transacional que reserva a chave e persiste seus metadados. Uma requisição concorrente aguarda o primeiro commit e reproduz a resposta sem executar um segundo envio. Se o banco ou a persistência da resposta falhar de forma observável, a compensação remove o objeto antes de devolver o erro.

Se o processo for interrompido depois do envio e antes do commit, uma nova tentativa equivalente deriva exatamente a mesma chave e sobrescreve o mesmo objeto, em vez de acumular cópias. Um expurgo por idade ainda é necessário para remover o objeto único que pode permanecer se essa tentativa nunca for refeita.

## Isolamento e dados

- RLS permite ler e alterar somente registros do próprio ator e papel;
- a chave não entra em logs, telemetria ou payload de auditoria;
- somente o hash SHA-256 do conteúdo e a resposta necessária ao replay são persistidos;
- a resposta permanece sujeita à mesma fronteira de ator;
- a janela contratual é de 24 horas; após a expiração, a chave é rejeitada e uma nova ação exige chave nova.

Uma rotina de expurgo/particionamento para registros expirados ainda deve ser definida junto da política final de retenção antes de produção.

## Evidência automatizada

- testes unitários validam formato, JSON canônico, hash e vínculo da chave à assinatura interna;
- teste integrado comprova RLS de leitura e conclusão;
- smoke test dispara pares realmente concorrentes em 27 ações de marketplace, comunicação, atendimento, agenda, ciclo do serviço e operação, incluindo os quatro uploads privados, confirma um único identificador e observa um replay em cada par;
- o mesmo smoke reutiliza chaves JSON e binárias com conteúdo diferente e exige `409`;
- o cockpit soma `idempotencyReplayCount` sem reter chave, corpo ou identidade.

## Próxima expansão

Antes do piloto externo, a próxima expansão deve automatizar a reconciliação entre metadados confirmados e objetos privados e o expurgo por idade. O protocolo idempotente, a compensação de falhas observáveis e as chaves determinísticas dos uploads já estão materializados.
