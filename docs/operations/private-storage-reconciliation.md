# Reconciliação do cofre privado

## Objetivo

Os bytes dos documentos e anexos ficam no bucket S3 privado, enquanto PostgreSQL preserva propriedade, vínculo, tipo, tamanho e hash. Uma interrupção abrupta entre o envio do objeto e o commit pode deixar um único objeto sem metadados. A reconciliação encontra essa diferença sem transformar uma corrida transitória em perda de arquivo.

## Escopo

A política `PRIVATE-STORAGE-RECONCILIATION-2026-01` compara:

- `provider_document_files`;
- `service_request_attachments`;
- `message_attachments`;
- `partner_support_attachments`;
- objetos sob `provider-verifications/`, `service-requests/`, `conversations/` e `partner-support/`.

Chaves fora desses prefixos são contadas como desconhecidas e nunca são excluídas automaticamente.

## Guardas de exclusão

Uma execução em modo de aplicação remove um objeto somente quando todas as condições são verdadeiras:

1. a chave pertence a um prefixo conhecido;
2. nenhuma das quatro tabelas referencia a chave;
3. a última modificação é anterior ao corte de 24 horas;
4. uma segunda leitura do banco ainda não encontra referência;
5. `Last-Modified` e ETag continuam iguais ao inventário;
6. o `DELETE` condicional confirma o mesmo ETag;
7. o limite máximo de cem exclusões por rodada ainda não foi alcançado.

Uma trava consultiva no PostgreSQL impede duas reconciliações simultâneas. Arquivos recentes, referenciados, alterados durante a inspeção ou pertencentes a prefixos desconhecidos permanecem intactos.

## Execução e auditoria

No Docker local, `storage-maintenance` roda ao iniciar e repete o ciclo a cada 24 horas. Plataformas externas devem usar um scheduler gerenciado com uma execução isolada do mesmo comando e credencial de manutenção dedicada.

Cada execução registra em `private_storage_reconciliation_runs` somente política, modo, estado, horários e contagens agregadas. A tabela usa RLS: apenas a Operação pode ler o histórico pela role da aplicação. Chaves, nomes de arquivo, pessoas e conteúdo não entram no relatório nem no cockpit.

O modo padrão sem `--apply` é somente inspeção. A idade zero é bloqueada na CLI e exige a opção explícita `--allow-zero-age`, reservada ao teste sintético.

## Evidência automatizada

`npm run test:storage` comprova que:

- a inspeção encontra um órfão sem removê-lo;
- a aplicação remove esse órfão elegível;
- um arquivo com metadados válidos permanece no bucket mesmo com corte de idade zero;
- um prefixo desconhecido permanece intacto;
- as execuções ficam registradas sem chaves de objeto.

O smoke confirma que a última execução bem-sucedida aparece no cockpit operacional sem divergências de referência ou tamanho.

## Limites antes de produção

- substituir a credencial administrativa local por uma role exclusiva com os menores privilégios necessários;
- executar por scheduler gerenciado com alerta de falha, ausência de execução e divergência;
- homologar versionamento, retenção, restauração e Object Lock conforme a política jurídica;
- definir o tratamento operacional de referências ausentes e divergências de tamanho;
- manter antivírus/quarentena como requisito separado; reconciliação não inspeciona conteúdo.
