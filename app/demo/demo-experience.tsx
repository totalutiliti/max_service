"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Role = "cliente" | "prestador" | "parceiro" | "operacao";
type Section = "inicio" | "atividade" | "mensagens" | "conta";
type RequestStep = 1 | 2 | 3 | 4;

interface PersistedRequest {
  id: string;
  publicCode: string;
  title: string;
  description: string;
  neighborhood: string;
  city: string;
  state: string;
  status: string;
  preferredWindow: string;
  categoryName: string;
  categoryIcon: string;
  proposalCount: number;
  hasActorProposal?: boolean;
}

interface PersistedProposal {
  id: string;
  requestId: string;
  amountCents: number;
  estimatedMinutes: number;
  message: string;
  status: string;
  providerName: string;
  providerCode: string;
}

interface PersistedConversation {
  id: string;
  bookingId: string;
  bookingStatus: string;
  scheduledFor: string | null;
  requestCode: string;
  requestTitle: string;
  otherName: string;
  otherCode: string;
  latestMessage: string | null;
  latestMessageAt: string | null;
}

interface PersistedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderCode?: string;
  body: string;
  createdAt: string;
}

const demoUiActorIds = {
  cliente: "00000000-0000-4000-8000-000000000101",
  prestador: "00000000-0000-4000-8000-000000000201",
} as const;

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

const categorySlugs: Record<string, string> = {
  Eletricista: "eletricista",
  Encanador: "encanador",
  Pedreiro: "pedreiro",
  Pintor: "pintor",
  Diarista: "diarista",
  Montagem: "montagem",
};

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
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const next = () => setStep((Math.min(4, step + 1)) as RequestStep);
  const back = () => setStep((Math.max(1, step - 1)) as RequestStep);
  const finish = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/v1/service-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          categorySlug: categorySlugs[category],
          title: description.trim().slice(0, 100),
          description: description.trim(),
          neighborhood: "Jardim Europa",
          city: "Sorocaba",
          state: "SP",
          preferredWindow: "O quanto antes",
        }),
      });
      const payload = await response.json() as { request?: { publicCode?: string }; error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível criar o pedido.");
      notify(`Pedido ${payload.request?.publicCode ?? ""} criado e salvo com sucesso.`);
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível salvar o pedido.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog" role="dialog" aria-modal="true" aria-labelledby="request-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar">×</button>
        {step < 4 && <><p className="dialog-kicker">NOVO PEDIDO · ETAPA {step} DE 3</p><div className="dialog-progress"><span style={{ width: `${step * 33.33}%` }} /></div></>}
        {step === 1 && <div className="dialog-content"><h2 id="request-title">Qual serviço você precisa?</h2><p>Escolha a opção que mais combina com a sua necessidade.</p><div className="dialog-categories">{categories.map(([icon, name]) => <button key={name} onClick={() => setCategory(name)} className={category === name ? "selected" : ""} aria-pressed={category === name}><span>{icon}</span>{name}<i aria-hidden="true">✓</i></button>)}</div></div>}
        {step === 2 && <div className="dialog-content"><h2 id="request-title">Conte um pouco mais.</h2><p>Uma descrição clara ajuda o profissional a enviar uma proposta melhor.</p><label className="field"><span>O que precisa ser feito?</span><textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} placeholder="Ex.: Preciso trocar um chuveiro que parou de aquecer..." rows={5} /><small>{description.length}/500 caracteres</small></label><button className="upload-placeholder" type="button" onClick={() => notify("Envio de fotos será conectado na próxima fase.")}><span>＋</span><strong>Adicionar fotos</strong><small>Opcional · JPG ou PNG</small></button></div>}
        {step === 3 && <div className="dialog-content"><h2 id="request-title">Quando e onde?</h2><p>Você poderá ajustar os detalhes com o profissional pelo chat.</p><label className="field"><span>Região</span><input value="Jardim Europa, Sorocaba - SP" readOnly /></label><div className="choice-grid"><button className="selected"><strong>O quanto antes</strong><small>Primeiro horário disponível</small></button><button><strong>Escolher uma data</strong><small>Defina dia e período</small></button></div><div className="privacy-tip"><span>⌖</span><p><strong>Seu endereço completo fica protegido.</strong> Mostramos apenas a região até você escolher um profissional.</p></div></div>}
        {step === 4 && <div className="dialog-success"><span className="success-check">✓</span><p className="dialog-kicker">PEDIDO PRONTO</p><h2 id="request-title">Agora é com a gente.</h2><p>Confirme para salvar o pedido. Profissionais disponíveis na sua região poderão enviar propostas.</p><div className="success-summary"><span>{categories.find((item) => item[1] === category)?.[0]}</span><div><small>Categoria</small><strong>{category}</strong><small>Jardim Europa · o quanto antes</small></div></div><button className="button" onClick={finish} disabled={saving}>{saving ? "Salvando..." : "Confirmar e acompanhar"}</button></div>}
        {step < 4 && <footer className="dialog-footer"><button className="secondary-action" onClick={step === 1 ? onClose : back}>{step === 1 ? "Cancelar" : "Voltar"}</button><button className="primary-action" onClick={next} disabled={step === 2 && description.trim().length < 10}>Continuar →</button></footer>}
      </section>
    </div>
  );
}

function ProviderView({ notify }: { notify: (message: string) => void }) {
  const [opportunities, setOpportunities] = useState<PersistedRequest[]>([]);
  const [selected, setSelected] = useState<PersistedRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/provider/opportunities", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar as oportunidades.");
        return response.json() as Promise<{ requests: PersistedRequest[] }>;
      })
      .then((payload) => setOpportunities(payload.requests))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar as oportunidades.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  return (
    <>
      <DashboardHeader role="prestador" eyebrow="Área do profissional" title="Bom trabalho começa com boas oportunidades."><span className="status-pill success">● Perfil aprovado</span></DashboardHeader>
      <div className="metric-grid"><Metric label="Novas oportunidades" value={loading ? "…" : String(opportunities.length)} detail="Pedidos disponíveis agora" tone="lime" /><Metric label="Propostas ativas" value={String(opportunities.filter((item) => item.hasActorProposal).length)} detail="Enviadas por você" /><Metric label="Serviços no mês" value="12" detail="+20% desde junho" /><Metric label="Avaliação" value="4,9" detail="126 avaliações" /></div>
      <div className="dashboard-columns wide-left">
        <section className="dashboard-section"><div className="dashboard-section-title"><div><small>OPORTUNIDADES PRÓXIMAS</small><h2>Pedidos disponíveis</h2></div><button onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Atualizar ↻</button></div><div className="opportunity-list">{loading && <div className="data-state">Buscando oportunidades...</div>}{!loading && opportunities.length === 0 && <div className="data-state"><strong>Nenhum pedido disponível agora.</strong><span>Novos pedidos aparecerão aqui automaticamente.</span></div>}{opportunities.slice(0, 5).map((request) => <Opportunity key={request.id} request={request} onSelect={() => setSelected(request)} />)}</div></section>
        <section className="dashboard-section profile-progress"><small>SEU PERFIL</small><div className="progress-ring">86<sup>%</sup></div><h2>Falta pouco.</h2><p>Adicione mais duas fotos de trabalhos para aumentar a confiança no seu perfil.</p><button className="primary-action" onClick={() => notify("Checklist do perfil aberto.")}>Completar perfil</button></section>
      </div>
      {selected && <ProposalDialog request={selected} onClose={() => setSelected(null)} onSaved={() => { setLoading(true); setRefresh((value) => value + 1); }} notify={notify} />}
    </>
  );
}

function Opportunity({ request, onSelect }: { request: PersistedRequest; onSelect: () => void }) {
  return <article><span className="category-icon">{request.categoryIcon}</span><div><strong>{request.title}</strong><span>{request.neighborhood} · {request.city}</span></div><div><small>{request.preferredWindow}</small><button onClick={onSelect}>{request.hasActorProposal ? "Atualizar proposta" : "Enviar proposta"}</button></div></article>;
}

function ProposalDialog({ request, onClose, onSaved, notify }: { request: PersistedRequest; onClose: () => void; onSaved: () => void; notify: (message: string) => void }) {
  const [amount, setAmount] = useState("125");
  const [minutes, setMinutes] = useState("90");
  const [message, setMessage] = useState("Posso realizar o serviço no período solicitado e levo as ferramentas necessárias.");
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/v1/provider/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          amountCents: Math.round(Number(amount) * 100),
          estimatedMinutes: Number(minutes),
          message: message.trim(),
        }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível enviar a proposta.");
      notify(request.hasActorProposal ? "Proposta atualizada com sucesso." : "Proposta enviada ao cliente.");
      onSaved();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível enviar a proposta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog proposal-dialog" role="dialog" aria-modal="true" aria-labelledby="proposal-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar">×</button>
        <div className="proposal-request-summary"><span>{request.categoryIcon}</span><div><small>{request.publicCode} · {request.categoryName}</small><h2 id="proposal-title">{request.title}</h2><p>{request.description}</p><em>⌖ {request.neighborhood}, {request.city} · {request.preferredWindow}</em></div></div>
        <form className="proposal-form" onSubmit={submit}>
          <div className="proposal-fields"><label className="field"><span>Valor da proposta</span><div className="money-input"><i>R$</i><input type="number" min="1" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div></label><label className="field"><span>Tempo estimado</span><select value={minutes} onChange={(event) => setMinutes(event.target.value)}><option value="60">Até 1 hora</option><option value="90">Até 1h30</option><option value="120">Até 2 horas</option><option value="240">Até 4 horas</option><option value="480">Até 1 dia</option></select></label></div>
          <label className="field"><span>Mensagem para o cliente</span><textarea rows={4} maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} required /><small>{message.length}/500 caracteres</small></label>
          <div className="commercial-preview"><span>i</span><p><strong>Simulação transparente</strong>Este ambiente não realiza cobrança. Taxas e repasses serão apresentados antes do aceite em produção.</p></div>
          <footer className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving || Number(amount) <= 0 || message.trim().length < 5}>{saving ? "Enviando..." : request.hasActorProposal ? "Atualizar proposta" : "Enviar proposta →"}</button></footer>
        </form>
      </section>
    </div>
  );
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
  const [persistedRequests, setPersistedRequests] = useState<PersistedRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PersistedRequest | null>(null);
  const [refreshRequests, setRefreshRequests] = useState(0);

  useEffect(() => {
    if (role !== "cliente") return;
    const controller = new AbortController();
    fetch("/api/v1/service-requests", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar pedidos.");
        return response.json() as Promise<{ requests: PersistedRequest[] }>;
      })
      .then((payload) => setPersistedRequests(payload.requests))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPersistedRequests([]);
      });
    return () => controller.abort();
  }, [role, refreshRequests]);

  const content = {
    cliente: { eyebrow: "HISTÓRICO DE SERVIÇOS", title: "Seus pedidos, todos no lugar certo.", metric: ["3", "Pedidos ativos"], rows: [["SV-1048", "Troca de chuveiro", "Agendado", "Amanhã, 09:30"], ["SV-1039", "Pintura do quarto", "Propostas", "3 recebidas"], ["SV-0981", "Montagem de armário", "Concluído", "18 de julho"]] },
    prestador: { eyebrow: "CENTRAL DE OPORTUNIDADES", title: "Escolha onde seu trabalho faz sentido.", metric: ["8", "Compatíveis hoje"], rows: [["OP-2218", "Instalação de ventilador", "2,4 km", "Hoje à tarde"], ["OP-2211", "Revisão de tomadas", "4,1 km", "A combinar"], ["OP-2198", "Troca de disjuntor", "6,0 km", "Sexta-feira"]] },
    parceiro: { eyebrow: "REDE DE PROFISSIONAIS", title: "Acompanhe cada indicação com transparência.", metric: ["24", "Afiliados ativos"], rows: [["PR-8M4Q", "João Lima · Pintor", "Ativo", "8 serviços"], ["PR-6D2A", "Ana Prado · Diarista", "Em análise", "Enviado hoje"], ["PR-9K7B", "Carlos Gomes · Encanador", "Ativo", "12 serviços"]] },
    operacao: { eyebrow: "FILA OPERACIONAL", title: "Prioridade clara para decidir com segurança.", metric: ["17", "Itens aguardando"], rows: [["PR-8M4Q", "Documento reenviado", "Revisar", "38 min"], ["SV-29K7", "Cancelamento contestado", "Prioridade", "1 h 12"], ["CS-4N8R", "Dúvida sobre proposta", "Aberto", "5 h 03"]] },
  }[role];
  const statusLabel: Record<string, string> = {
    open: "Aberto",
    proposals_received: "Propostas",
    booked: "Agendado",
    in_progress: "Em andamento",
    completed: "Concluído",
    cancelled: "Cancelado",
  };
  const rows = role === "cliente" && persistedRequests.length > 0
    ? persistedRequests.map((request) => [
        request.publicCode,
        request.title,
        statusLabel[request.status] ?? request.status,
        request.proposalCount > 0 ? `${request.proposalCount} proposta(s)` : request.preferredWindow,
      ])
    : content.rows;
  const primaryMetric = role === "cliente" && persistedRequests.length > 0 ? String(persistedRequests.length) : content.metric[0];
  return (
    <>
      <DashboardHeader role={role} eyebrow={content.eyebrow} title={content.title}><button className="button button-small" onClick={() => notify("Filtros atualizados.")}>Filtrar resultados</button></DashboardHeader>
      <div className="activity-overview"><article><small>{content.metric[1]}</small><strong>{primaryMetric}</strong><span>{role === "cliente" && persistedRequests.length > 0 ? "Dados persistidos" : "Atualizado agora"}</span></article><article><small>Taxa de conclusão</small><strong>96%</strong><span>Últimos 30 dias</span></article><article><small>Tempo médio de resposta</small><strong>18 min</strong><span>Dentro da meta</span></article></div>
      <section className="dashboard-section records-card">
        <div className="records-toolbar"><label><span>Buscar</span><input placeholder="Código, serviço ou pessoa" /></label><button className="secondary-action" onClick={() => notify("Relatório demonstrativo preparado.")}>Exportar</button></div>
        <div className="record-list">
          {rows.map(([code, title, status, detail]) => <button key={code} onClick={() => { const request = persistedRequests.find((item) => item.publicCode === code); if (role === "cliente" && request) setSelectedRequest(request); else notify(`${code}: detalhes carregados.`); }}><span className="record-code">{code}</span><span><strong>{title}</strong><small>{detail}</small></span><span className={`status-pill ${status === "Prioridade" ? "warning" : "success"}`}>{status}</span><i>→</i></button>)}
        </div>
      </section>
      {selectedRequest && <ProposalComparisonDialog request={selectedRequest} onClose={() => setSelectedRequest(null)} onChanged={() => setRefreshRequests((value) => value + 1)} notify={notify} />}
    </>
  );
}

function ProposalComparisonDialog({ request, onClose, onChanged, notify }: { request: PersistedRequest; onClose: () => void; onChanged: () => void; notify: (message: string) => void }) {
  const [proposals, setProposals] = useState<PersistedProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  const fetchProposals = useCallback(async () => {
    const response = await fetch(`/api/v1/customer/proposals?requestId=${encodeURIComponent(request.id)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar as propostas.");
    const payload = await response.json() as { proposals: PersistedProposal[] };
    return payload.proposals;
  }, [request.id]);

  useEffect(() => {
    closeRef.current?.focus();
    void fetchProposals()
      .then(setProposals)
      .catch((error: unknown) => notify(error instanceof Error ? error.message : "Não foi possível carregar as propostas."))
      .finally(() => setLoading(false));
  }, [fetchProposals, notify]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const accept = async (proposal: PersistedProposal) => {
    setAccepting(proposal.id);
    try {
      const response = await fetch("/api/v1/customer/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível aceitar a proposta.");
      notify(`Proposta de ${proposal.providerName} aceita. Serviço agendado.`);
      setProposals(await fetchProposals());
      onChanged();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível aceitar a proposta.");
    } finally {
      setAccepting("");
    }
  };

  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const hasAccepted = proposals.some((proposal) => proposal.status === "accepted") || request.status === "booked";

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog comparison-dialog" role="dialog" aria-modal="true" aria-labelledby="comparison-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar">×</button>
        <header className="comparison-header"><p className="dialog-kicker">{request.publicCode} · {request.categoryName}</p><h2 id="comparison-title">Compare as propostas</h2><p>{request.title} · {request.neighborhood}, {request.city}</p></header>
        <div className="comparison-list">
          {loading && <div className="data-state">Carregando propostas...</div>}
          {!loading && proposals.length === 0 && <div className="data-state"><strong>Aguardando propostas.</strong><span>Você receberá uma notificação quando um profissional responder.</span></div>}
          {proposals.map((proposal) => <article key={proposal.id} className={`comparison-card ${proposal.status === "accepted" ? "accepted" : proposal.status === "declined" ? "declined" : ""}`}><div className="comparison-provider"><span className="mini-avatar">{proposal.providerName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{proposal.providerName}</strong><small>{proposal.providerCode} · ★ 4,9</small></div><span className={`status-pill ${proposal.status === "accepted" ? "success" : proposal.status === "declined" ? "warning" : "success"}`}>{proposal.status === "accepted" ? "✓ Escolhida" : proposal.status === "declined" ? "Não escolhida" : "Nova proposta"}</span></div><p>{proposal.message}</p><div className="comparison-offer"><div><small>VALOR</small><strong>{currency.format(proposal.amountCents / 100)}</strong></div><div><small>PREVISÃO</small><strong>{proposal.estimatedMinutes < 120 ? `${proposal.estimatedMinutes} min` : `${Math.round(proposal.estimatedMinutes / 60)} h`}</strong></div><button className="primary-action" disabled={hasAccepted || accepting === proposal.id || proposal.status !== "sent"} onClick={() => accept(proposal)}>{accepting === proposal.id ? "Confirmando..." : proposal.status === "accepted" ? "Proposta aceita" : "Escolher profissional"}</button></div></article>)}
        </div>
        <footer className="comparison-footer"><span>✓ Você só confirma depois de comparar.</span><button className="secondary-action" onClick={onClose}>Fechar</button></footer>
      </section>
    </div>
  );
}

function MessagesView({ role, notify }: { role: Role; notify: (message: string) => void }) {
  if (role !== "cliente" && role !== "prestador") return <NonTransactionalMessages role={role} notify={notify} />;
  return <PersistentMessages role={role} notify={notify} />;
}

function PersistentMessages({ role, notify }: { role: "cliente" | "prestador"; notify: (message: string) => void }) {
  const [conversations, setConversations] = useState<PersistedConversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<PersistedMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/messaging?role=${role}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar as conversas.");
        return response.json() as Promise<{ conversations: PersistedConversation[] }>;
      })
      .then((payload) => {
        setConversations(payload.conversations);
        setSelectedId((current) => payload.conversations.some((item) => item.id === current) ? current : payload.conversations[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar as conversas.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, role]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/v1/messaging?role=${role}&conversationId=${encodeURIComponent(selectedId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar as mensagens.");
        return response.json() as Promise<{ messages: PersistedMessage[] }>;
      })
      .then((payload) => setMessages(payload.messages))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar as mensagens.");
      });
    return () => controller.abort();
  }, [notify, role, selectedId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const selected = conversations.find((item) => item.id === selectedId);
  const actorId = demoUiActorIds[role];
  const time = (value: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const schedule = (value: string) => new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedId) return;
    setSending(true);
    try {
      const response = await fetch("/api/v1/messaging", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, conversationId: selectedId, body }),
      });
      const payload = await response.json() as { message?: PersistedMessage | string; error?: string };
      if (!response.ok || typeof payload.message !== "object") throw new Error(payload.error ?? (typeof payload.message === "string" ? payload.message : "Não foi possível enviar a mensagem."));
      const sent = { ...payload.message, senderName: roleDetails[role].name };
      setMessages((current) => [...current, sent]);
      setConversations((current) => current.map((conversation) => conversation.id === selectedId ? { ...conversation, latestMessage: body, latestMessageAt: sent.createdAt } : conversation));
      setDraft("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <DashboardHeader role={role} eyebrow="CENTRAL DE MENSAGENS" title="Conversa organizada, serviço tranquilo." />
      <section className="messages-layout">
        <aside className="conversation-list">
          <div className="conversation-search"><input aria-label="Buscar conversa" placeholder="Buscar conversa" /></div>
          {loading && <div className="data-state">Carregando conversas...</div>}
          {!loading && conversations.length === 0 && <div className="data-state"><strong>Nenhuma conversa ainda.</strong><span>Ela será criada quando uma proposta for aceita.</span></div>}
          {conversations.map((conversation) => <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={conversation.id === selectedId ? "active" : ""}><span className="mini-avatar">{conversation.otherName.split(" ").map((part) => part[0]).slice(0,2).join("")}</span><span><strong>{conversation.otherName}</strong><small>{conversation.requestCode} · {conversation.requestTitle}</small><em>{conversation.latestMessage ?? "Conversa liberada"}</em></span>{conversation.bookingStatus === "scheduled" && <i>✓</i>}</button>)}
        </aside>
        {selected ? <div className="chat-panel"><header><span className="mini-avatar">{selected.otherName.split(" ").map((part) => part[0]).slice(0,2).join("")}</span><div><strong>{selected.otherName}</strong><small><span className="live-dot" /> {selected.requestCode} · {selected.scheduledFor ? `Agendado: ${schedule(selected.scheduledFor)}` : selected.bookingStatus}</small></div><button aria-label="Mais opções">•••</button></header><div className="chat-messages"><div className="chat-date">CONVERSA DO SERVIÇO</div>{messages.length === 0 && <div className="data-state"><strong>Conversa liberada.</strong><span>Envie a primeira mensagem para combinar os detalhes.</span></div>}{messages.map((message) => <p key={message.id} className={`message ${message.senderId === actorId ? "sent" : "received"}`}>{message.body}<small>{time(message.createdAt)}{message.senderId === actorId ? " · ✓" : ""}</small></p>)}<div ref={endRef} /></div><form className="message-composer" onSubmit={send}><button type="button" aria-label="Anexos disponíveis em uma próxima fase" onClick={() => notify("Anexos privados serão habilitados em uma próxima fase.")}>＋</button><input aria-label="Mensagem" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva uma mensagem..." /><button type="submit" disabled={sending || !draft.trim()}>{sending ? "Enviando..." : "Enviar"}</button></form></div> : <div className="chat-panel empty-chat"><div className="data-state"><strong>Selecione uma conversa.</strong><span>As mensagens ficam vinculadas ao serviço contratado.</span></div></div>}
      </section>
    </>
  );
}

function NonTransactionalMessages({ role, notify }: { role: "parceiro" | "operacao"; notify: (message: string) => void }) {
  return <><DashboardHeader role={role} eyebrow={role === "operacao" ? "CENTRAL DE ATENDIMENTOS" : "MENSAGENS DA REDE"} title="Comunicação com contexto e responsabilidade." /><section className="dashboard-section non-transactional-message"><span>◉</span><div><small>PRÓXIMO MÓDULO</small><h2>{role === "operacao" ? "Atendimentos e ocorrências serão vinculados aos casos." : "Conversas com afiliados serão liberadas na gestão da rede."}</h2><p>A conversa transacional já está ativa para clientes e profissionais. Este perfil receberá um canal próprio, com permissões e histórico específicos.</p><button className="secondary-action" onClick={() => notify("Módulo registrado no backlog da plataforma.")}>Ver próxima etapa</button></div></section></>;
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
