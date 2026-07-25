# Solicitação de integração — processamento seguro de arquivos

Esta trilha implementa contratos isolados, validação estrutural, máquina de estados,
adaptador ClamAV, retry fail-closed, idempotência e expurgo. Ela deliberadamente não
altera migrations oficiais, `api/app.module.ts`, Compose, Azure ou os downloads
atuais.

## Alterações compartilhadas necessárias em uma integração posterior

1. Revisar e aprovar a proposta
   `docs/architecture/proposals/secure-file-processing-schema.md`.
2. Criar migration oficial com numeração escolhida no momento da integração,
   após rebase sobre a sequência vigente.
3. Registrar repositórios, object store de quarentena, scanner e processadores no
   módulo NestJS somente depois da migration.
4. Disponibilizar ClamAV local/dev como serviço isolado, sem porta pública, com
   health check, limites de memória/CPU e atualização monitorada das definições.
5. Criar credenciais distintas e mínimas para:
   - API gravar somente em quarentena;
   - scanner ler quarentena e promover objetos limpos;
   - downloads ler somente o prefixo aprovado;
   - job de expurgo remover conforme política.
6. Publicar uploads inicialmente em `quarantine/<purpose>/<uuid>` e nunca no
   prefixo atualmente baixável.
7. Integrar um worker/scheduler com lease, retry exponencial, limite de
   concorrência, fila de erro e alertas. Redis existe, mas esta trilha não presume
   biblioteca de filas nem altera dependências.
8. Alterar os quatro downloads para exigir `APPROVED`, preservando a autorização
   de domínio e RLS já existentes.
9. Decidir se arquivos pequenos continuam no BFF ou se haverá upload direto
   assinado. Se houver:
   - ticket único com TTL curto;
   - chave de quarentena fixa;
   - limite de tamanho e checksum;
   - finalize idempotente por `HeadObject`;
   - nenhuma URL de download antes de `APPROVED`.
10. Incluir `api/tests/secure-file-processing.test.ts` no comando oficial de
    testes ou criar um script dedicado, sem remover os gates existentes.

## Configuração esperada do adaptador ClamAV

O `ClamAvAntimalwareScanner` recebe host, porta, timeout de conexão, limite de
resposta e tamanho de chunk por injeção de configuração. Valores de ambiente,
segredos, Compose e Azure ficam fora desta branch para evitar acoplamento e
conflito com as trilhas de identidade e staging.

Produção deve falhar fechada quando configuração, scanner ou definições estiverem
indisponíveis. Nenhum fallback baseado apenas em extensão ou magic bytes pode
aprovar o arquivo.

## Rollback de integração

- desligar a criação de novos tickets de upload;
- manter arquivos não aprovados em quarentena;
- reverter o roteamento dos quatro fluxos sem promover `not_scanned`;
- preservar tabelas/eventos novos para auditoria;
- remover worker e credenciais novas somente após confirmar que não há leases ou
  purges em execução.

O rollback jamais deve transformar `QUARANTINED`, `SCANNING` ou `ERROR` em
`APPROVED`.
