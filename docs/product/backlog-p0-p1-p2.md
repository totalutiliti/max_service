# Backlog P0/P1/P2

## P0 - validar o marketplace

- autenticação e confirmação reais sobre as sessões revogáveis já materializadas;
- aprovação jurídica das minutas, enquanto onboarding, aceites e consentimentos de cliente/prestador já estão materializados;
- expansão do catálogo e das regiões já persistentes, após validação do piloto em Sorocaba; matching por categoria, cobertura, verificação, disponibilidade e capacidade já está materializado;
- solicitação, propostas, chat, agenda e estados já materializados; a agenda inclui jornada semanal, bloqueios, slots reais, seleção no aceite e proteção transacional contra sobreposição;
- cancelamentos, avaliações e notificações;
- parceiro, atribuição, painel, captura pública por link/QR e triagem operacional;
- moderação, documentos privados e administração;
- PSP sandbox, regra 12/2/2 configurável e ledger;
- ampliar idempotência para mensagens, suporte, anexos e comandos operacionais e adicionar E2E/a11y em navegador; criação de pedido, envio de proposta e aceite já possuem chave assinada, garantia transacional, RLS e teste concorrente, enquanto migrations, isolamento da agenda, rate limit, headers HTTP, CORS e limites de corpo também são testados automaticamente no CI;
- ampliar observabilidade para exportação de métricas, traces, alertas e SLOs gerenciados; liveness, readiness, cockpit operacional, IDs de correlação, logs JSON sem PII, métricas locais limitadas e smoke tests de autorização já estão materializados;
- concluir os oito gates persistentes de prontidão: identidade, marca/domínio, modelo jurídico/fiscal, PSP, privacidade/retenção, autorização e escopo formal do piloto; backup/restore lógico já é ensaiado automaticamente, mas infraestrutura gerenciada, PITR, RPO/RTO e object storage ainda estão pendentes.

## P1 - operar o piloto

- ampliar as preferências granulares e horários já materializados no Web Push para e-mail/SMS somente após seleção e homologação dos provedores;
- ampliar a central de suporte, que já possui SLA, atribuição entre múltiplos operadores e anexos privados, com escalonamento externo e fluxo formal de disputa;
- segmentação consentida, monitoramento de abuso e relatórios avançados para as campanhas e cupons já materializados;
- anúncios contextuais moderados;
- agendamento e entrega externa consentida para os relatórios, cujos alertas e metas comparativas já estão materializados;
- antifraude de indicação;
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
