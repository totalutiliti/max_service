# ADR 0005 — Estratégia de identidade de produção

**Status:** proposto; decisão de negócio, segurança e operação pendente.

## Contexto

O piloto usa perfis fictícios e sessões demonstrativas. Esse mecanismo é útil para
validar jornadas, mas não comprova a identidade de uma pessoa e não pode ser
promovido a autenticação de produção.

A aplicação precisa de cadastro, verificação de contato, autenticação resistente a
enumeração, recuperação de conta, MFA para Operação e ciclo completo de sessões. A
escolha de fornecedor ou de credencial local afeta custo, suporte, privacidade,
continuidade e resposta a incidentes; por isso ela não será inferida no código.

## Alternativas

### Provedor OIDC gerenciado

- reduz a superfície própria de senha, MFA e recuperação;
- oferece protocolos e controles maduros, desde que o tenant seja configurado e
  homologado corretamente;
- cria dependência comercial e operacional do fornecedor;
- exige análise de residência de dados, exportação, SLA, suporte, custos e plano de
  saída.

### Credenciais locais

- dá maior controle sobre a experiência e os dados;
- exige Argon2id parametrizado, pepper em cofre, verificação de contato, MFA,
  recuperação, notificações, proteção contra abuso e operação contínua;
- amplia de forma relevante a superfície de ataque e a responsabilidade da equipe.

### Modelo híbrido

- permite OIDC e credenciais locais sob um mesmo contrato;
- pode facilitar migração ou atender públicos distintos;
- multiplica caminhos críticos, testes, suporte e riscos de vinculação indevida de
  contas.

## Decisão provisória

Nenhuma alternativa foi escolhida.

O código adota contratos neutros de provedor e uma fundação comum de conta, sessão,
auditoria e autorização. A emissão de sessão exige um `VerifiedIdentityPrincipal`
produzido por um adaptador homologado; não existe rota pública que aceite esse
principal do cliente.

A funcionalidade permanece fechada quando qualquer uma destas condições ocorrer:

- `DEMO_MODE=true`;
- `PRODUCTION_IDENTITY_ENABLED` não é exatamente `true`;
- `IDENTITY_PROVIDER_MODE` está ausente, inválido ou `disabled`;
- as políticas de validade, inatividade e rotação de sessão não estão explícitas;
- o adaptador escolhido não está registrado e saudável.

## Critérios para aceitar este ADR

- responsável de produto aprova jornadas de cadastro, verificação e recuperação;
- Segurança aprova threat model, MFA, lockout, retenção e resposta a incidentes;
- Jurídico/privacidade aprova tratamento, suboperadores e residência dos dados;
- Operação aprova SLA, suporte, observabilidade, runbooks e recuperação;
- Finanças aprova o custo total e limites de escala;
- a opção vencedora passa por homologação funcional e de segurança em staging.

## Consequências

- a fundação pode evoluir sem acoplar o domínio a um fornecedor;
- nenhuma pessoa consegue criar uma sessão de produção até a integração decidida;
- o piloto demonstrativo continua isolado;
- a plataforma não deve ser declarada pronta para produção com este ADR pendente.
