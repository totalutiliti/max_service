# Design system Max Service

## Direção

Industrial, direto e confiável. A engrenagem representa trabalho; as linhas de velocidade representam resposta. O contraste preto/verde vem da marca, com prata e tons claros para legibilidade. A interface não reproduz a apresentação azul nem o e-mail da Triider.

## Tokens iniciais

| Token | Valor | Uso |
|---|---|---|
| ink-950 | `#080b09` | fundo principal |
| ink-900 | `#101511` | superfícies escuras |
| lime-500 | `#75e600` | ação primária |
| lime-300 | `#b9ff63` | destaque sobre fundo escuro |
| silver-100 | `#edf1ed` | texto principal claro |
| stone-500 | `#69736c` | texto secundário |
| paper | `#f5f7f3` | superfície clara |
| danger | `#d7463e` | erro/bloqueio |
| warning | `#d89016` | atenção |
| success | `#258a46` | sucesso sem depender só de cor |

Tipografia: sans-serif de alta legibilidade; pesos 600/800 em títulos curtos. Escala fluida com corpo mínimo de 16 px. Espaçamento baseado em 4 px; alvos de toque mínimos de 44 px; raio 12-24 px; foco com anel verde e offset escuro.

## Componentes

- botão primário verde com texto quase preto;
- botão secundário transparente com borda;
- campo com label persistente, ajuda e erro textual;
- card de categoria com ícone, nome e área de toque integral;
- card de prestador com avaliação, distância, selo de status e CTA;
- stepper curto com rótulo explícito;
- status com ícone + texto, nunca apenas cor;
- navegação inferior no mobile e cabeçalho compacto no desktop.

## Acessibilidade

WCAG 2.2 AA, ordem de foco lógica, `skip link`, landmarks, labels, mensagens anunciadas, redução de movimento, contraste verificado, teclado completo e texto selecionável.
