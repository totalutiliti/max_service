# E2E e acessibilidade

## Objetivo

As suítes em `tests/e2e/` transformam os requisitos de navegação, marketplace e WCAG 2.2 AA em contratos repetíveis. Elas rodam contra o ambiente Docker completo, usando Google Chrome, Playwright e Axe.

## Cobertura atual

- tela de acesso e radiogroup dos quatro perfis;
- operação por teclado com setas, `Home` e `End`;
- dezesseis combinações de perfil e área: início, atividade, mensagens e conta;
- painel de reconciliação do cofre privado na Operação;
- `skip link` com transferência efetiva de foco;
- logout e revogação preservada após recarregar;
- navegação móvel e estado `aria-current`;
- regras automatizáveis WCAG 2 A/AA, 2.1 A/AA e 2.2 AA.
- jornada transacional cliente–profissional integralmente pela interface:
  - criação de pedido;
  - localização da oportunidade e envio de proposta;
  - comparação, consulta de agenda e aceite do horário;
  - mensagens bilaterais;
  - início e conclusão do serviço;
  - avaliação do cliente.
- jornada de exceção cliente–Operação integralmente pela interface:
  - cancelamento justificado de serviço agendado;
  - abertura automática de ocorrência;
  - entrada da ocorrência na fila operacional;
  - atribuição e mudança para análise;
  - resolução auditável;
  - acompanhamento do estado final pelo cliente.

A busca de oportunidades por código, serviço, categoria ou região mantém a jornada operável mesmo quando o histórico do profissional cresce. Os cenários transacionais geram títulos exclusivos a cada execução e não dependem de registros preexistentes.

## Execução

```bash
docker compose up -d --build --wait
npm run test:e2e
```

O endereço padrão é `http://127.0.0.1:4174`. Outro ambiente pode ser testado com `E2E_BASE_URL`.

Para executar somente a jornada do marketplace:

```bash
npm run test:e2e -- tests/e2e/marketplace-journey.spec.ts
```

Para executar somente a jornada operacional de cancelamento:

```bash
npm run test:e2e -- tests/e2e/cancellation-operations.spec.ts
```

## Diagnóstico e limite

Capturas, traces e o relatório HTML ficam em `outputs/` e não são versionados. Em falha no GitHub Actions, esses artefatos são preservados por sete dias.

Axe detecta uma parte importante das violações, mas não comprova sozinho a conformidade integral. Antes do piloto com pessoas reais ainda são obrigatórios testes manuais de zoom/reflow, leitor de tela, linguagem, entendimento, fluxos de erro e tecnologias assistivas.
