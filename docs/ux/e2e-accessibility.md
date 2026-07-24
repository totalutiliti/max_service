# E2E e acessibilidade

## Objetivo

A suíte em `tests/e2e/accessibility.spec.ts` transforma os requisitos de navegação e WCAG 2.2 AA em um contrato repetível. Ela roda contra o ambiente Docker completo, usando Google Chrome, Playwright e Axe.

## Cobertura atual

- tela de acesso e radiogroup dos quatro perfis;
- operação por teclado com setas, `Home` e `End`;
- dezesseis combinações de perfil e área: início, atividade, mensagens e conta;
- painel de reconciliação do cofre privado na Operação;
- `skip link` com transferência efetiva de foco;
- logout e revogação preservada após recarregar;
- navegação móvel e estado `aria-current`;
- regras automatizáveis WCAG 2 A/AA, 2.1 A/AA e 2.2 AA.

## Execução

```bash
docker compose up -d --build --wait
npm run test:e2e
```

O endereço padrão é `http://127.0.0.1:4174`. Outro ambiente pode ser testado com `E2E_BASE_URL`.

## Diagnóstico e limite

Capturas, traces e o relatório HTML ficam em `outputs/` e não são versionados. Em falha no GitHub Actions, esses artefatos são preservados por sete dias.

Axe detecta uma parte importante das violações, mas não comprova sozinho a conformidade integral. Antes do piloto com pessoas reais ainda são obrigatórios testes manuais de zoom/reflow, leitor de tela, linguagem, entendimento, fluxos de erro e tecnologias assistivas.
