# Proposta de schema para processamento seguro de arquivos

Status: proposta técnica isolada. Este documento não é uma migration oficial, não
reserva número na sequência de migrations e não autoriza dados ou documentos reais.

## Objetivo

Centralizar o ciclo de segurança hoje repetido em
`provider_document_files`, `service_request_attachments`,
`message_attachments` e `partner_support_attachments`, preservando os vínculos e
as policies de domínio existentes.

## Estado e tabelas propostas

`private_file_objects`:

- `id uuid` como identificador opaco;
- `domain_type` e `domain_id` para o vínculo de domínio;
- `owner_id` e `uploader_id`;
- `state` limitado a `RECEIVED`, `QUARANTINED`, `SCANNING`, `APPROVED`,
  `REJECTED`, `ERROR` ou `EXPIRED`;
- `version integer` monotônica para compare-and-swap;
- `quarantine_object_key` e `approved_object_key`, ambos únicos quando presentes;
- nome original normalizado, MIME declarado, MIME detectado, tamanho e SHA-256;
- ETag/versão do objeto para cópia e exclusão condicionais;
- tentativas de scan, último código de erro e próxima tentativa;
- `retention_until`, `expires_at`, `legal_hold`, `released_at` e `purged_at`;
- timestamps e constraints que impeçam `APPROVED` sem chave limpa e que impeçam
  download de qualquer outro estado.

`private_file_scan_events` append-only:

- arquivo, versão, estado anterior/posterior e tentativa;
- engine, versão da engine, versão das definições e assinatura detectada;
- início, fim, duração e erro normalizado sem conteúdo, nome ou chave do objeto;
- executor técnico e `correlation_id`.

`private_file_purge_events` append-only:

- arquivo, versão da política, motivo, estado e timestamps;
- ETag/versão usados na exclusão condicional;
- resultado agregado e recibo, sem copiar conteúdo ou credenciais.

`private_file_idempotency_records`:

- ator/escopo, operação, chave idempotente, hash da requisição, lease e expiração;
- estados `PROCESSING` e `COMPLETED`;
- resposta mínima e expiração aprovada;
- unicidade por escopo, operação e chave.

## Integração incremental sugerida

1. Criar as tabelas novas em migration futura revisada, sem alterar imediatamente
   as quatro tabelas de domínio.
2. Fazer backfill sintético dos metadados existentes, mantendo-os bloqueados como
   `ERROR` ou `EXPIRED`; `not_scanned` nunca deve virar `APPROVED`.
3. Adicionar referência opcional `private_file_id` às tabelas de domínio.
4. Migrar uploads um fluxo por vez para o prefixo `quarantine/`.
5. Liberar download apenas quando a referência central estiver `APPROVED`.
6. Remover as colunas duplicadas somente em migration expand/contract posterior.

## Regras invariantes

- `QUARANTINED` e `SCANNING` nunca são baixáveis.
- Indisponibilidade, timeout ou resposta desconhecida do scanner terminam em
  `ERROR`, nunca em aprovação.
- Promoção para o prefixo limpo exige hash, tamanho e versão esperados.
- Retry de scan e purge é idempotente e usa compare-and-swap.
- `legal_hold=true` bloqueia expurgo.
- Um arquivo `EXPIRED` permanece terminal; DELETE físico pode ser repetido.
- Eventos são append-only e não carregam bytes, chave de storage ou PII.
