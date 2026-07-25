# Publicidade contextual moderada

## Escopo materializado

O perfil **Anunciante** cria campanhas com nome interno, título, texto, chamada, destino HTTPS, janela de exibição, limite de impressões e contexto opcional de categoria e região. Toda peça nasce em `pending_review`; somente a Operação pode aprovar, rejeitar, pausar ou reativar, sempre com justificativa, evento append-only e auditoria.

Uma campanha aprovada pode aparecer na terceira etapa de um pedido quando:

- anunciante, categoria e região continuam ativos;
- a janela está vigente e o limite de impressões não foi atingido;
- categoria e região do pedido atual coincidem com os alvos definidos;
- a Operação não pausou nem rejeitou a peça.

O cartão é identificado como **Patrocinado**, informa a marca e explica a categoria/região que motivaram a exibição. O anúncio não altera ranking, matching, preço, proposta ou elegibilidade do marketplace.

## Minimização e clique

A seleção usa somente o contexto do pedido corrente. Não consulta histórico de navegação, mensagens, perfil financeiro, avaliações, contatos ou comportamento anterior.

Cada impressão persiste campanha, categoria, região e um hash SHA-256 de token aleatório. Não persiste cliente, sessão, IP, cookie nem token bruto. O clique envia o token uma única vez; uma função de banco de escopo mínimo valida o hash, campanha vigente e estado aprovado antes de marcar `clicked_at` e devolver o destino HTTPS.

Anunciante e Operação recebem apenas contagens de impressões, cliques e taxa agregada. O anunciante não consulta entregas individuais, contexto por pessoa ou identidades.

## Isolamento

- cliente lê somente campanha aprovada e vigente durante a seleção contextual;
- anunciante cria e consulta apenas as próprias campanhas e o próprio histórico de moderação;
- anunciante não altera estado de moderação;
- Operação consulta todas as campanhas e executa transições permitidas;
- prestador e parceiro recebem zero campanhas, perfis publicitários, eventos e entregas;
- comandos de criação e moderação são idempotentes e vinculados ao ator autenticado.

## Limites antes de produção

A versão local não realiza cobrança, leilão, faturamento, segmentação comportamental, upload de criativo nem integração com rede externa. Antes de tráfego real ainda são necessários política comercial e editorial aprovada, base legal, retenção formal, processo de denúncia, bloqueio de domínios maliciosos, revisão automatizada como apoio humano, limites distribuídos, monitoramento e plano de resposta. A existência deste protótipo não altera `productionAuthorized: false`.
