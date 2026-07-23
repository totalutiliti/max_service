# MVP

## Cenário demonstrável

Uma cliente escolhe “Eletricista”, descreve a troca de um chuveiro, informa o bairro e o melhor horário. Dois prestadores elegíveis enviam propostas. A cliente compara preço, prazo, distância e avaliação, escolhe um, conversa, agenda e acompanha o serviço até a conclusão. Depois, ambos avaliam a experiência. A operação consegue consultar a trilha e tratar um cancelamento.

## Incluído

- superfície pública e onboarding;
- cliente, prestador, parceiro e administração;
- seis categorias piloto persistentes, ordenáveis e ativáveis pela Operação com justificativa e auditoria;
- solicitações, propostas, conversa, agendamento e histórico de estados;
- cancelamento estruturado e avaliações;
- código persistente, registro manual e captura pública de indicação por link/QR, com consentimento versionado e sem criação automática de conta;
- fila operacional para analisar indicações, aprovar para onboarding ou rejeitar com justificativa e histórico;
- moderação manual de prestador;
- atividade operacional real, pesquisável por área, referência, ação ou responsável;
- gestão operacional do catálogo compartilhado por cliente, parceiro e captura pública, sem apagar histórico ao desativar uma categoria;
- mensagens transacionais e notificações internas persistentes, contadores reais de não lidas e sincronização incremental automática;
- central persistente de atendimento parceiro–Operação, com contexto opcional da indicação, conversa append-only, anexos privados sintéticos, transições justificadas, atribuição entre operadores, prioridade e SLA versionado de primeira resposta e resolução; push, e-mail e escalonamento externo permanecem como integrações posteriores;
- PSP fake e visualização de divisão financeira, sem transação real;
- dados 100% fictícios.

## Fora

Carteira, PIX, conta, saldo sacável, crédito, investimento de cashback, biometria, antecedentes automatizados, inteligência artificial de medição/orçamento, categorias reguladas, publicidade comportamental, lojas de aplicativos e território nacional.

## Critério de sucesso

O fluxo principal deve ser executável em ambiente local com dois atores separados, sem acesso cruzado, e produzir histórico de status e auditoria verificáveis.
