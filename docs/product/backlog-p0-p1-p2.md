# Backlog P0/P1/P2

## P0 - validar o marketplace

- autenticação e confirmação reais sobre as sessões revogáveis já materializadas;
- aprovação jurídica das minutas, enquanto onboarding, aceites e consentimentos de cliente/prestador já estão materializados;
- expansão do catálogo e das regiões já persistentes, após validação do piloto em Sorocaba; matching por categoria, cobertura, verificação, disponibilidade e capacidade já está materializado;
- solicitação, propostas, chat, agenda e estados já materializados; a agenda inclui jornada semanal, bloqueios, slots reais, seleção no aceite e proteção transacional contra sobreposição;
- cancelamentos, avaliações e notificações;
- parceiro, atribuição, painel, captura pública por link/QR, triagem operacional e antifraude explicável com revisão humana;
- moderação, documentos privados e administração;
- PSP sandbox, regra 12/2/2 configurável e ledger;
- manter e ampliar o E2E conforme novas jornadas forem adicionadas; Playwright já conduz integralmente pela interface a criação de pedido, envio de proposta, escolha de horário, aceite, mensagens bilaterais, início, conclusão e avaliação; cancelamento, abertura automática de ocorrência, atribuição, resolução operacional e acompanhamento final pelo cliente; indicação de profissional, sinal preventivo explicável, revisão humana, análise, aprovação para onboarding e retorno do status ao parceiro; atendimento compartilhado da rede, com mensagem, triagem, SLA, resposta, resolução, contestação e decisão formal; e publicidade contextual, do envio pelo anunciante à aprovação e exibição explicada ao cliente; acesso, cinco perfis, vinte áreas, versão móvel, teclado, foco, revogação de sessão e WCAG 2.2 AA também estão cobertos; comandos operacionais JSON e uploads privados possuem chave assinada e garantia transacional; reconciliação, migrations imutáveis com dry-run e detecção de drift, RLS, isolamento da agenda, rate limit, headers HTTP, CORS, limites de corpo e imagens Docker sem vulnerabilidade corrigível alta/crítica também são testados automaticamente no CI;
- promover o exportador OpenMetrics e o coletor Prometheus local já materializados para serviço gerenciado, alta disponibilidade, retenção aprovada, Alertmanager, plantão e SLOs homologados; liveness, readiness, cockpit operacional, IDs de correlação, logs JSON sem PII, séries de baixa cardinalidade, seis recording rules, sete alertas e smoke tests já estão materializados;
- concluir os oito gates persistentes de prontidão: identidade, marca/domínio, modelo jurídico/fiscal, PSP, privacidade/retenção, autorização e escopo formal do piloto; a central de direitos, exportação minimizada, decisões humanas e recibos verificáveis já materializam o fluxo técnico de privacidade, mas retenção/anonimização seguem dependentes de aprovação; backup/restore lógico já é ensaiado automaticamente, mas infraestrutura gerenciada, PITR, RPO/RTO e object storage ainda estão pendentes.

## P1 - operar o piloto

- ampliar as preferências granulares e horários já materializados no Web Push para e-mail/SMS somente após seleção e homologação dos provedores;
- ampliar a central de suporte, que já possui SLA, atribuição entre múltiplos operadores, anexos privados e fluxo formal de disputa, com escalonamento externo após escolha do provedor;
- calibrar com evidências reais os limiares e a retenção do monitoramento de campanhas já materializado, preservando agregação, contenção temporária e revisão humana;
- calibrar inventário, limites, retenção e política editorial dos anúncios contextuais moderados já materializados, sem ampliar os dados usados na seleção;
- homologar o provedor e ativar a entrega externa dos relatórios; agendamento semanal/mensal, destinatário sintético consentido, pausa, recorrência, fotografia agregada, checksum, idempotência e histórico append-only já estão materializados em modo local bloqueado;
- calibrar com evidências reais os limiares do antifraude explicável já materializado, mantendo revisão humana e sem fontes externas;
- expansão controlada de categorias não reguladas;
- integração com provedor de e-mail/SMS e PSP homologado em sandbox.

## P2 - escalar após evidências

- aplicativos de loja;
- novas regiões;
- categorias com regras específicas;
- seguro/garantia, se aprovados;
- provedores adicionais de verificação;
- recursos assistivos por voz;
- crédito ou serviços financeiros exclusivamente por parceiro autorizado e após gate jurídico.
