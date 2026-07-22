"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Role = "cliente" | "prestador" | "parceiro" | "operacao";
type Section = "inicio" | "atividade" | "mensagens" | "conta";
type RequestStep = 1 | 2 | 3 | 4;

const roleDetails: Record<Role, { label: string; short: string; name: string; email: string; description: string }> = {
  cliente: {
    label: "Cliente",
    short: "CL",
    name: "Marina Alves",
    email: "marina@demo.maxservice",
    description: "Pedir um serviço, comparar propostas e acompanhar a execução.",
  },
  prestador: {
    label: "Profissional",
    short: "PR",
    name: "Rafael Santos",
    email: "rafael@demo.maxservice",
    description: "Receber oportunidades, enviar propostas e organizar a agenda.",
  },
  parceiro: {
    label: "Parceiro",
    short: "PC",
    name: "João Martins",
    email: "joao@demo.maxservice",
    description: "Indicar profissionais e acompanhar a rede e as comissões.",
  },
  operacao: {
    label: "Administração",
    short: "AD",
    name: "Equipe Max",
    email: "operacao@demo.maxservice",
    description: "Moderar cadastros, atender ocorrências e acompanhar o negócio.",
  },
};

const categories = [
  ["⚡", "Eletricista"], ["💧", "Encanador"], ["▦", "Pedreiro"],
  ["◒", "Pintor"], ["✦", "Diarista"], ["⌁", "Montagem"],
];

const sectionLabels: Record<Role, Record<Section, string>> = {
  cliente: { inicio: "Início", atividade: "Meus pedidos", mensagens: "Mensagens", conta: "Conta e plano" },
  prestador: { inicio: "Visão geral", atividade: "Oportunidades", mensagens: "Mensagens", conta: "Conta e plano" },
  parceiro: { inicio: "Visão geral", atividade: "Minha rede", mensagens: "Mensagens", conta: "Conta e repasses" },
  operacao: { inicio: "Visão geral", atividade: "Fila operacional", mensagens: "Atendimentos", conta: "Configurações" },
};

export function DemoExperience() {
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState<Role>("cliente");
  const [section, setSection] = useState<Section>("inicio");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const enter = () => {
    setSignedIn(true);
    setSection("inicio");
  };

  const changeRole = (nextRole: Role) => {
    setRole(nextRole);
    setSection("inicio");
    setToast(`Perfil alterado para ${roleDetails[nextRole].label}.`);
  };

  if (!signedIn) return <AccessScreen role={role} setRole={setRole} onEnter={enter} />;

  return (
    <Shell
      role={role}
      section={section}
      setSection={setSection}
      changeRole={changeRole}
      onSignOut={() => setSignedIn(false)}
    >
      {section === "inicio" && role === "cliente" && <CustomerView notify={setToast} />}
      {section === "inicio" && role === "prestador" && <ProviderView notify={setToast} />}
      {section === "inicio" && role === "parceiro" && <PartnerView notify={setToast} />}
      {section === "inicio" && role === "operacao" && <OperationsView notify={setToast} />}
      {section === "atividade" && <ActivityView role={role} notify={setToast} />}
      {section === "mensagens" && <MessagesView role={role} notify={setToast} />}
      {section === "conta" && <AccountView role={role} notify={setToast} />}
      <MobileNav role={role} section={section} setSection={setSection} />
      {toast && <div className="app-toast" role="status"><span>✓</span>{toast}</div>}
    </Shell>
  );
}

function AccessScreen({ role, setRole, onEnter }: { role: Role; setRole: (role: Role) => void; onEnter: () => void }) {
  const selected = roleDetails[role];
  return (
    <main className="access-page">
      <section className="access-brand-panel">
        <Link className="brand-lockup" href="/" aria-label="Max Service - início">
          <Image src="/max-service-mark.png" alt="" width={58} height={58} priority />
          <span><strong>MAX</strong> SERVICE</span>
        </Link>
        <div className="access-brand-copy">
          <p className="eyebrow"><span /> PLATAFORMA MAX SERVICE</p>
          <h1>O trabalho acontece.<br/><em>A Max organiza.</em></h1>
          <p>Um ambiente para clientes, profissionais, parceiros e operação conduzirem cada serviço do pedido à conclusão.</p>
        </div>
        <div className="access-proof">
          <span>✓</span><p><strong>Ambiente demonstrativo seguro</strong><small>Dados fictícios e nenhuma cobrança real.</small></p>
        </div>
      </section>

      <section className="access-form-panel" aria-labelledby="access-title">
        <div className="access-form-wrap">
          <p className="access-step">ACESSO À DEMONSTRAÇÃO</p>
          <h2 id="access-title">Escolha como deseja entrar.</h2>
          <p className="access-intro">Você poderá trocar de perfil a qualquer momento dentro da plataforma.</p>
          <div className="access-role-grid" role="radiogroup" aria-label="Perfil de acesso">
            {(Object.keys(roleDetails) as Role[]).map((item) => (
              <button
                key={item}
                className={role === item ? "selected" : ""}
                onClick={() => setRole(item)}
                role="radio"
                aria-checked={role === item}
              >
                <span className="access-role-icon">{roleDetails[item].short}</span>
                <span><strong>{roleDetails[item].label}</strong><small>{roleDetails[item].description}</small></span>
                <i aria-hidden="true">✓</i>
              </button>
            ))}
          </div>
          <div className="demo-credentials">
            <div><small>E-MAIL DEMONSTRATIVO</small><strong>{selected.email}</strong></div>
            <span>Senha preenchida automaticamente</span>
          </div>
          <button className="button access-submit" onClick={onEnter}>Entrar como {selected.label} <span aria-hidden="true">→</span></button>
          <p className="access-disclaimer">Ao continuar, você entra apenas na demonstração local. A autenticação definitiva será conectada ao backend na próxima fase.</p>
          <Link className="access-back" href="/">← Voltar para o site</Link>
        </div>
      </section>
    </main>
  );
}

function Shell({ role, section, setSection, changeRole, onSignOut, children }: {
  role: Role;
  section: Section;
  setSection: (section: Section) => void;
  changeRole: (role: Role) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const user = roleDetails[role];
  return (
    <main className="demo-shell">
      <a className="skip-link" href="#painel">Pular para o painel</a>
      <aside className="demo-sidebar">
        <Link className="brand-lockup compact" href="/" aria-label="Voltar ao início da Max Service">
          <Image src="/max-service-mark.png" alt="" width={48} height={48} priority />
          <span><strong>MAX</strong> SERVICE</span>
        </Link>
        <div className="workspace-chip"><span>{user.short}</span><div><small>ESPAÇO DE TRABALHO</small><strong>{user.label}</strong></div></div>
        <nav className="app-nav" aria-label="Navegação da plataforma">
          {(Object.keys(sectionLabels[role]) as Section[]).map((item, index) => (
            <button key={item} onClick={() => setSection(item)} className={section === item ? "active" : ""} aria-current={section === item ? "page" : undefined}>
              <span aria-hidden="true">{["⌂", "▤", "◉", "⚙"][index]}</span>{sectionLabels[role][item]}
              {item === "mensagens" && <i>2</i>}
            </button>
          ))}
        </nav>
        <div className="demo-profile-switcher">
          <small>PERFIL DA DEMONSTRAÇÃO</small>
          <select value={role} onChange={(event) => changeRole(event.target.value as Role)} aria-label="Trocar perfil da demonstração">
            {(Object.keys(roleDetails) as Role[]).map((item) => <option key={item} value={item}>{roleDetails[item].label}</option>)}
          </select>
          <p>Dados fictícios · sem pagamento real</p>
        </div>
        <button className="signout-button" onClick={onSignOut}>← Sair da demonstração</button>
      </aside>
      <div className="demo-main" id="painel">{children}</div>
    </main>
  );
}

function DashboardHeader({ role, eyebrow, title, children }: { role: Role; eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="dashboard-header">
      <div><p>{eyebrow}</p><h1>{title}</h1></div>
      <div className="dashboard-actions">{children}<button className="notification-button" aria-label="Notificações, duas não lidas">2</button><div className="mini-avatar">{roleDetails[role].short}</div></div>
    </header>
  );
}

function CustomerView({ notify }: { notify: (message: string) => void }) {
  const [requestOpen, setRequestOpen] = useState(false);
  return (
    <>
      <DashboardHeader role="cliente" eyebrow="Quarta-feira, 22 de julho" title="Olá, Marina. O que vamos resolver?">
        <button className="location-chip" onClick={() => notify("Localização atualizada: Sorocaba, SP.")}>⌖ Sorocaba, SP</button>
      </DashboardHeader>
      <section className="dashboard-hero">
        <div><span className="small-label">NOVO PEDIDO</span><h2>Precisa de ajuda em casa?</h2><p>Conte o que precisa e receba propostas de profissionais disponíveis na sua região.</p><button className="button" onClick={() => setRequestOpen(true)}>Pedir um serviço →</button></div>
        <div className="dashboard-hero-mark" aria-hidden="true"><Image src="/max-service-mark.png" alt="" width={220} height={220} /></div>
      </section>
      <section className="dashboard-section dashboard-spaced">
        <div className="dashboard-section-title"><div><small>ACESSO RÁPIDO</small><h2>Serviços mais procurados</h2></div><button onClick={() => setRequestOpen(true)}>Ver todos →</button></div>
        <div className="quick-categories">
          {categories.map(([icon, name]) => <button key={name} onClick={() => setRequestOpen(true)}><span>{icon}</span><strong>{name}</strong></button>)}
        </div>
      </section>
      <div className="dashboard-columns">
        <section className="dashboard-section activity-card">
          <div className="dashboard-section-title"><div><small>EM ANDAMENTO</small><h2>Troca de chuveiro</h2></div><span className="status-pill success">✓ Agendado</span></div>
          <div className="activity-provider"><div className="avatar avatar-one">RS</div><div><strong>Rafael Santos</strong><span>Eletricista · ★ 4,9</span></div><div><small>Amanhã</small><strong>09:30</strong></div></div>
          <div className="timeline-mini"><span className="done" /><span className="done" /><span className="current" /><span /></div>
          <div className="timeline-labels"><span>Pedido</span><span>Proposta</span><span>Agendado</span><span>Concluído</span></div>
          <div className="card-actions"><button className="secondary-action" onClick={() => notify("Detalhes do serviço carregados.")}>Ver detalhes</button><button className="primary-action" onClick={() => notify("Conversa com Rafael aberta.")}>Abrir conversa</button></div>
        </section>
        <section className="dashboard-section help-card">
          <span className="help-icon">?</span><div><small>PRECISA DE AJUDA?</small><h2>A gente está por perto.</h2><p>Tire dúvidas sobre pedidos, propostas ou segurança.</p></div><button className="secondary-action" onClick={() => notify("Atendimento iniciado. Tempo estimado: 2 minutos.")}>Falar com o suporte</button>
        </section>
      </div>
      {requestOpen && <RequestDialog onClose={() => setRequestOpen(false)} notify={notify} />}
    </>
  );
}

function RequestDialog({ onClose, notify }: { onClose: () => void; notify: (message: string) => void }) {
  const [step, setStep] = useState<RequestStep>(1);
  const [category, setCategory] = useState("Eletricista");
  const [description, setDescription] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const next = () => setStep((Math.min(4, step + 1)) as RequestStep);
  const back = () => setStep((Math.max(1, step - 1)) as RequestStep);
  const finish = () => { notify("Pedido criado com sucesso. A busca por profissionais começou."); onClose(); };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog" role="dialog" aria-modal="true" aria-labelledby="request-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar">×</button>
        {step < 4 && <><p className="dialog-kicker">NOVO PEDIDO · ETAPA {step} DE 3</p><div className="dialog-progress"><span style={{ width: `${step * 33.33}%` }} /></div></>}
        {step === 1 && <div className="dialog-content"><h2 id="request-title">Qual serviço você precisa?</h2><p>Escolha a opção que mais combina com a sua necessidade.</p><div className="dialog-categories">{categories.map(([icon, name]) => <button key={name} onClick={() => setCategory(name)} className={category === name ? "selected" : ""} aria-pressed={category === name}><span>{icon}</span>{name}<i aria-hidden="true">✓</i></button>)}</div></div>}
        {step === 2 && <div className="dialog-content"><h2 id="request-title">Conte um pouco mais.</h2><p>Uma descrição clara ajuda o profissional a enviar uma proposta melhor.</p><label className="field"><span>O que precisa ser feito?</span><textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} placeholder="Ex.: Preciso trocar um chuveiro que parou de aquecer..." rows={5} /><small>{description.length}/500 caracteres</small></label><button className="upload-placeholder" type="button" onClick={() => notify("Envio de fotos será conectado na próxima fase.")}><span>＋</span><strong>Adicionar fotos</strong><small>Opcional · JPG ou PNG</small></button></div>}
        {step === 3 && <div className="dialog-content"><h2 id="request-title">Quando e onde?</h2><p>Você poderá ajustar os detalhes com o profissional pelo chat.</p><label className="field"><span>Região</span><input value="Jardim Europa, Sorocaba - SP" readOnly /></label><div className="choice-grid"><button className="selected"><strong>O quanto antes</strong><small>Primeiro horário disponível</small></button><button><strong>Escolher uma data</strong><small>Defina dia e período</small></button></div><div className="privacy-tip"><span>⌖</span><p><strong>Seu endereço completo fica protegido.</strong> Mostramos apenas a região até você escolher um profissional.</p></div></div>}
        {step === 4 && <div className="dialog-success"><span className="success-check">✓</span><p className="dialog-kicker">PEDIDO ENVIADO</p><h2 id="request-title">Agora é com a gente.</h2><p>Profissionais disponíveis na sua região poderão enviar propostas. Você receberá uma notificação quando isso acontecer.</p><div className="success-summary"><span>{categories.find((item) => item[1] === category)?.[0]}</span><div><small>Categoria</small><strong>{category}</strong><small>Jardim Europa · o quanto antes</small></div></div><button className="button" onClick={finish}>Acompanhar pedido</button></div>}
        {step < 4 && <footer className="dialog-footer"><button className="secondary-action" onClick={step === 1 ? onClose : back}>{step === 1 ? "Cancelar" : "Voltar"}</button><button className="primary-action" onClick={next} disabled={step === 2 && description.trim().length < 10}>Continuar →</button></footer>}
      </section>
    </div>
  );
}

function ProviderView({ notify }: { notify: (message: string) => void }) {
  return (
    <>
      <DashboardHeader role="prestador" eyebrow="Área do profissional" title="Bom trabalho começa com boas oportunidades."><span className="status-pill success">● Perfil aprovado</span></DashboardHeader>
      <div className="metric-grid"><Metric label="Novas oportunidades" value="8" detail="3 a menos de 5 km" tone="lime" /><Metric label="Propostas ativas" value="4" detail="2 visualizadas hoje" /><Metric label="Serviços no mês" value="12" detail="+20% desde junho" /><Metric label="Avaliação" value="4,9" detail="126 avaliações" /></div>
      <div className="dashboard-columns wide-left">
        <section className="dashboard-section"><div className="dashboard-section-title"><div><small>OPORTUNIDADES PRÓXIMAS</small><h2>Pedidos compatíveis</h2></div><button onClick={() => notify("Todas as oportunidades foram carregadas.")}>Ver todas →</button></div><div className="opportunity-list"><Opportunity icon="⚡" title="Instalação de ventilador" place="Vila Carvalho · 2,4 km" when="Hoje à tarde" notify={notify} /><Opportunity icon="⚡" title="Revisão de tomadas" place="Campolim · 4,1 km" when="A combinar" notify={notify} /><Opportunity icon="⌁" title="Fixação de suporte" place="Jardim Faculdade · 3,6 km" when="Amanhã" notify={notify} /></div></section>
        <section className="dashboard-section profile-progress"><small>SEU PERFIL</small><div className="progress-ring">86<sup>%</sup></div><h2>Falta pouco.</h2><p>Adicione mais duas fotos de trabalhos para aumentar a confiança no seu perfil.</p><button className="primary-action" onClick={() => notify("Checklist do perfil aberto.")}>Completar perfil</button></section>
      </div>
    </>
  );
}

function Opportunity({ icon, title, place, when, notify }: { icon: string; title: string; place: string; when: string; notify: (message: string) => void }) {
  return <article><span className="category-icon">{icon}</span><div><strong>{title}</strong><span>{place}</span></div><div><small>{when}</small><button onClick={() => notify(`Pedido “${title}” aberto.`)}>Ver pedido</button></div></article>;
}

function PartnerView({ notify }: { notify: (message: string) => void }) {
  return (
    <>
      <DashboardHeader role="parceiro" eyebrow="Área do parceiro" title="Sua rede está crescendo."><button className="button button-small" onClick={() => notify("Link de indicação copiado.")}>Compartilhar link</button></DashboardHeader>
      <div className="metric-grid"><Metric label="Afiliados ativos" value="24" detail="+4 neste mês" tone="lime" /><Metric label="Em análise" value="5" detail="Aguardando moderação" /><Metric label="Serviços concluídos" value="38" detail="Por afiliados no mês" /><Metric label="Comissão estimada" value="R$ 684" detail="Valor demonstrativo" /></div>
      <div className="dashboard-columns">
        <section className="dashboard-section referral-card"><div><small>SEU LINK DE INDICAÇÃO</small><h2>Convide profissionais da sua região.</h2><p>O vínculo só é criado quando o profissional conclui o cadastro pelo seu link ou QR Code.</p><div className="fake-link"><span>maxservice.local/p/PC-7K2M</span><button onClick={() => notify("Link de indicação copiado.")}>Copiar</button></div></div><div className="fake-qr" aria-label="Representação visual de QR Code"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></section>
        <section className="dashboard-section"><div className="dashboard-section-title"><div><small>REDE RECENTE</small><h2>Novos afiliados</h2></div></div><div className="affiliate-list"><Affiliate initials="JL" name="João Lima" category="Pintor" status="Ativo" /><Affiliate initials="AP" name="Ana Prado" category="Diarista" status="Em análise" /><Affiliate initials="CG" name="Carlos Gomes" category="Encanador" status="Ativo" /></div></section>
      </div>
    </>
  );
}

function Affiliate({ initials, name, category, status }: { initials: string; name: string; category: string; status: string }) {
  return <div><span className="mini-avatar neutral">{initials}</span><p><strong>{name}</strong><small>{category}</small></p><span className={`status-pill ${status === "Ativo" ? "success" : "warning"}`}>{status}</span></div>;
}

function OperationsView({ notify }: { notify: (message: string) => void }) {
  return (
    <>
      <DashboardHeader role="operacao" eyebrow="Operação e moderação" title="O que precisa de atenção hoje?" />
      <div className="metric-grid"><Metric label="Perfis em análise" value="17" detail="4 há mais de 24 h" tone="warning" /><Metric label="Documentos pendentes" value="9" detail="3 reenviados hoje" /><Metric label="Ocorrências abertas" value="6" detail="1 em alta prioridade" /><Metric label="Serviços ativos" value="143" detail="98% sem ocorrência" /></div>
      <section className="dashboard-section operations-table"><div className="dashboard-section-title"><div><small>FILA PRIORITÁRIA</small><h2>Análises e ocorrências</h2></div><button onClick={() => notify("Fila operacional atualizada.")}>Atualizar fila ↻</button></div><div className="table-head"><span>Tipo</span><span>Referência</span><span>Motivo</span><span>Espera</span><span>Status</span></div><OperationRow type="Prestador" reference="PR-8M4Q" reason="Documento reenviado" wait="38 min" status="Revisar" notify={notify} /><OperationRow type="Ocorrência" reference="SV-29K7" reason="Cancelamento contestado" wait="1 h 12" status="Prioridade" notify={notify} /><OperationRow type="Prestador" reference="PR-6D2A" reason="Dados incompletos" wait="3 h 40" status="Pendência" notify={notify} /><OperationRow type="Suporte" reference="CS-4N8R" reason="Dúvida sobre proposta" wait="5 h 03" status="Aberto" notify={notify} /></section>
      <div className="operations-note"><span>!</span><p><strong>Ações críticas exigem justificativa.</strong> Aprovações, rejeições, suspensões e mudanças de regra ficam registradas com antes/depois na trilha de auditoria.</p></div>
    </>
  );
}

function OperationRow({ type, reference, reason, wait, status, notify }: { type: string; reference: string; reason: string; wait: string; status: string; notify: (message: string) => void }) {
  return <article className="table-row"><span data-label="Tipo"><strong>{type}</strong></span><span data-label="Referência">{reference}</span><span data-label="Motivo">{reason}</span><span data-label="Espera">{wait}</span><span data-label="Status"><button onClick={() => notify(`${reference}: análise aberta.`)} className={status === "Prioridade" ? "danger-action" : "secondary-action"}>{status}</button></span></article>;
}

function ActivityView({ role, notify }: { role: Role; notify: (message: string) => void }) {
  const content = {
    cliente: { eyebrow: "HISTÓRICO DE SERVIÇOS", title: "Seus pedidos, todos no lugar certo.", metric: ["3", "Pedidos ativos"], rows: [["SV-1048", "Troca de chuveiro", "Agendado", "Amanhã, 09:30"], ["SV-1039", "Pintura do quarto", "Propostas", "3 recebidas"], ["SV-0981", "Montagem de armário", "Concluído", "18 de julho"]] },
    prestador: { eyebrow: "CENTRAL DE OPORTUNIDADES", title: "Escolha onde seu trabalho faz sentido.", metric: ["8", "Compatíveis hoje"], rows: [["OP-2218", "Instalação de ventilador", "2,4 km", "Hoje à tarde"], ["OP-2211", "Revisão de tomadas", "4,1 km", "A combinar"], ["OP-2198", "Troca de disjuntor", "6,0 km", "Sexta-feira"]] },
    parceiro: { eyebrow: "REDE DE PROFISSIONAIS", title: "Acompanhe cada indicação com transparência.", metric: ["24", "Afiliados ativos"], rows: [["PR-8M4Q", "João Lima · Pintor", "Ativo", "8 serviços"], ["PR-6D2A", "Ana Prado · Diarista", "Em análise", "Enviado hoje"], ["PR-9K7B", "Carlos Gomes · Encanador", "Ativo", "12 serviços"]] },
    operacao: { eyebrow: "FILA OPERACIONAL", title: "Prioridade clara para decidir com segurança.", metric: ["17", "Itens aguardando"], rows: [["PR-8M4Q", "Documento reenviado", "Revisar", "38 min"], ["SV-29K7", "Cancelamento contestado", "Prioridade", "1 h 12"], ["CS-4N8R", "Dúvida sobre proposta", "Aberto", "5 h 03"]] },
  }[role];
  return (
    <>
      <DashboardHeader role={role} eyebrow={content.eyebrow} title={content.title}><button className="button button-small" onClick={() => notify("Filtros atualizados.")}>Filtrar resultados</button></DashboardHeader>
      <div className="activity-overview"><article><small>{content.metric[1]}</small><strong>{content.metric[0]}</strong><span>Atualizado agora</span></article><article><small>Taxa de conclusão</small><strong>96%</strong><span>Últimos 30 dias</span></article><article><small>Tempo médio de resposta</small><strong>18 min</strong><span>Dentro da meta</span></article></div>
      <section className="dashboard-section records-card">
        <div className="records-toolbar"><label><span>Buscar</span><input placeholder="Código, serviço ou pessoa" /></label><button className="secondary-action" onClick={() => notify("Relatório demonstrativo preparado.")}>Exportar</button></div>
        <div className="record-list">
          {content.rows.map(([code, title, status, detail]) => <button key={code} onClick={() => notify(`${code}: detalhes carregados.`)}><span className="record-code">{code}</span><span><strong>{title}</strong><small>{detail}</small></span><span className={`status-pill ${status === "Prioridade" ? "warning" : "success"}`}>{status}</span><i>→</i></button>)}
        </div>
      </section>
    </>
  );
}

function MessagesView({ role, notify }: { role: Role; notify: (message: string) => void }) {
  const otherName = role === "cliente" ? "Rafael Santos" : role === "prestador" ? "Marina Alves" : role === "parceiro" ? "Ana Prado" : "Marina Alves";
  const context = role === "operacao" ? "Atendimento CS-4N8R" : role === "parceiro" ? "Cadastro profissional" : "Serviço SV-1048";
  return (
    <>
      <DashboardHeader role={role} eyebrow="CENTRAL DE MENSAGENS" title="Conversa organizada, serviço tranquilo." />
      <section className="messages-layout">
        <aside className="conversation-list">
          <div className="conversation-search"><input aria-label="Buscar conversa" placeholder="Buscar conversa" /></div>
          <button className="active"><span className="mini-avatar">{otherName.split(" ").map((part) => part[0]).slice(0,2).join("")}</span><span><strong>{otherName}</strong><small>{context}</small><em>Perfeito, combinado!</em></span><i>2</i></button>
          <button><span className="mini-avatar neutral">MS</span><span><strong>Suporte Max</strong><small>Central de ajuda</small><em>Como podemos ajudar?</em></span></button>
        </aside>
        <div className="chat-panel">
          <header><span className="mini-avatar">{otherName.split(" ").map((part) => part[0]).slice(0,2).join("")}</span><div><strong>{otherName}</strong><small><span className="live-dot" /> Online agora · {context}</small></div><button aria-label="Mais opções">•••</button></header>
          <div className="chat-messages"><div className="chat-date">HOJE</div><p className="message received">Olá! Vi os detalhes e consigo realizar o serviço amanhã pela manhã.<small>10:18</small></p><p className="message sent">Ótimo. O horário das 09:30 funciona para mim.<small>10:20 · ✓✓</small></p><p className="message received">Perfeito, combinado! Levo todo o material necessário.<small>10:21</small></p></div>
          <form className="message-composer" onSubmit={(event) => { event.preventDefault(); notify("Mensagem enviada na demonstração."); }}><button type="button" aria-label="Anexar arquivo">＋</button><input aria-label="Mensagem" placeholder="Escreva uma mensagem..." /><button type="submit">Enviar</button></form>
        </div>
      </section>
    </>
  );
}

function AccountView({ role, notify }: { role: Role; notify: (message: string) => void }) {
  const user = roleDetails[role];
  const isOperational = role === "operacao";
  return (
    <>
      <DashboardHeader role={role} eyebrow={isOperational ? "CONFIGURAÇÕES DO SISTEMA" : "CONTA E PLANO"} title={isOperational ? "Controle o piloto com regras claras." : "Sua conta, do seu jeito."} />
      <div className="account-layout">
        <section className="dashboard-section account-profile">
          <div className="account-avatar">{user.short}</div><div><small>PERFIL ATUAL</small><h2>{user.name}</h2><p>{user.email}</p></div><button className="secondary-action" onClick={() => notify("Edição de perfil aberta.")}>Editar perfil</button>
        </section>
        <section className="plan-card">
          <div><span className="plan-badge">PILOTO MAX</span><h2>{isOperational ? "Ambiente de validação" : "Sem mensalidade nesta fase"}</h2><p>{isOperational ? "Parâmetros críticos permanecem bloqueados até aprovação operacional e jurídica." : "Durante o piloto, você conhece a plataforma sem assinatura mensal. Regras comerciais futuras serão apresentadas antes de qualquer aceite."}</p></div>
          <div className="plan-price"><small>VALOR MENSAL</small><strong>R$ 0</strong><span>Ambiente demonstrativo</span></div>
        </section>
        <section className="dashboard-section account-options">
          <div className="dashboard-section-title"><div><small>PREFERÊNCIAS</small><h2>Configurações da conta</h2></div></div>
          <button onClick={() => notify("Preferências de notificação atualizadas.")}><span>Notificações</span><small>E-mail e avisos na plataforma</small><i>→</i></button>
          <button onClick={() => notify("Central de privacidade aberta.")}><span>Privacidade e segurança</span><small>Dados pessoais, acesso e consentimentos</small><i>→</i></button>
          <button onClick={() => notify("Termos do piloto carregados.")}><span>Termos do piloto</span><small>Versão demonstrativa e regras aplicáveis</small><i>→</i></button>
        </section>
        <section className="dashboard-section commercial-note">
          <small>TRANSPARÊNCIA COMERCIAL</small><h2>Nenhuma cobrança acontece aqui.</h2><p>A estrutura de comissão 12% + 2% + 2% permanece como hipótese de validação. Pagamentos reais dependerão de parceiro financeiro autorizado, aceite explícito e conciliação.</p><button className="secondary-action" onClick={() => notify("Resumo comercial demonstrativo aberto.")}>Entender a regra demonstrativa</button>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <article className={`metric-card ${tone ?? ""}`}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>;
}

function MobileNav({ role, section, setSection }: { role: Role; section: Section; setSection: (section: Section) => void }) {
  return <nav className="mobile-role-bar" aria-label="Navegação móvel">{(Object.keys(sectionLabels[role]) as Section[]).map((item, index) => <button key={item} onClick={() => setSection(item)} className={section === item ? "active" : ""}><span>{["⌂", "▤", "◉", "⚙"][index]}</span>{sectionLabels[role][item].replace("Meus ", "")}</button>)}</nav>;
}
