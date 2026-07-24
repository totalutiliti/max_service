# Proteção preventiva das indicações

## Objetivo e limite

A política `REFERRAL-RISK-2026-01` sinaliza padrões que merecem conferência humana antes da decisão operacional. Ela não consulta bureaus, crédito, antecedentes, redes sociais ou fontes externas; não produz pontuação sobre a pessoa; e nunca aprova ou rejeita automaticamente.

Os sinais usam exclusivamente dados já registrados no fluxo Max Service:

- possível autorreferência, quando o e-mail normalizado corresponde ao e-mail do parceiro;
- presença do mesmo e-mail normalizado em outra rede de parceiro;
- volume recente de indicações do mesmo parceiro acima do limite da política.

Aliases com `+` no endereço são normalizados apenas para comparar cadastros. O endereço original permanece preservado.

## Decisão humana e transparência

Cada indicação recebe uma avaliação imutável com versão da política, nível (`low`, `attention` ou `high`), sinais explicáveis e horário. Uma indicação com sinal recebe o resumo neutro **verificação adicional** na área do Parceiro. Somente a Operação vê os motivos completos.

A Operação precisa registrar uma conclusão com justificativa:

- `cleared`: os sinais foram esclarecidos e a triagem pode continuar;
- `confirmed`: a inconsistência foi confirmada e a aprovação para onboarding fica bloqueada.

Sem essa revisão, aprovar ou rejeitar uma indicação sinalizada é recusado pela API. A revisão é append-only, vinculada ao operador, idempotente e registrada também na auditoria.

## Isolamento

RLS não permite ao Parceiro nem ao canal público ler avaliações ou descobrir outras redes. Eles recebem apenas o booleano de verificação adicional da própria indicação. A função de contexto preventivo expõe somente contagens agregadas da indicação autorizada, e as avaliações e revisões detalhadas são legíveis exclusivamente pela Operação.

## Evidências

- teste unitário das regras e dos limiares;
- teste integrado de migration, contexto autorizado, RLS e revisão exclusiva da Operação;
- Playwright cobrindo autorreferência, bloqueio da decisão, liberação humana e aprovação;
- smoke concorrente comprovando replay idempotente da revisão preventiva.
