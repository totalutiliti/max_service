# Ensaio de backup e restauração

## Objetivo

Provar, de forma repetível, que o PostgreSQL local pode ser recuperado sem perder dados críticos, migrations, constraints, grants ou políticas de RLS. O ensaio não substitui backup gerenciado, PITR ou um plano de desastre de produção.

## Execução

Com o Docker saudável:

```bash
npm run test:restore
```

O processo:

1. lê uma fotografia das migrations, contagens críticas e proteções do banco original;
2. produz um dump PostgreSQL em formato custom dentro do container;
3. cria um banco temporário com nome aleatório;
4. restaura esquema, dados, grants, constraints e policies;
5. compara migrations, contagens, RLS forçado, policies e exclusion constraints;
6. conecta com a role real de runtime e prova o fail-closed sem contexto, o bloqueio do cliente e a visão da Operação;
7. encerra conexões e remove o banco e o arquivo temporários, inclusive quando há falha.

O banco de origem nunca é apagado, renomeado ou usado como destino.

## Critérios de aprovação

- dump maior que 4 KB;
- lista completa de migrations idêntica;
- contagens críticas idênticas;
- mesmo número de tabelas com RLS e `FORCE ROW LEVEL SECURITY`;
- mesmo número de policies;
- duas constraints de exclusão da agenda preservadas;
- role `max_service_app` conecta ao banco restaurado;
- sem ator, dados protegidos retornam zero linhas;
- cliente recebe zero gates e Operação recebe os oito;
- nenhuma base ou arquivo temporário permanece após o teste.

## Limites de produção

O CI comprova restaurabilidade lógica do PostgreSQL em Docker. Antes de produção ainda são obrigatórios:

- serviço gerenciado com backups automáticos e PITR;
- criptografia e retenção aprovadas;
- cópia fora da região/conta de origem;
- metas formais de RPO e RTO;
- ensaio periódico em staging com volume representativo;
- restauração coordenada do object storage privado;
- runbook de incidente, responsáveis e evidência assinada.
