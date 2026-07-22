import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Max Service | Serviço certo, perto de você",
  description:
    "Encontre profissionais da sua região, compare propostas e acompanhe o serviço em um só lugar.",
};

const categories = [
  { icon: "⚡", name: "Eletricista", detail: "Instalações e reparos" },
  { icon: "💧", name: "Encanador", detail: "Vazamentos e hidráulica" },
  { icon: "🧱", name: "Pedreiro", detail: "Obras e reformas" },
  { icon: "🖌️", name: "Pintor", detail: "Pintura e acabamento" },
  { icon: "✨", name: "Diarista", detail: "Limpeza residencial" },
  { icon: "🛠️", name: "Montagem", detail: "Móveis e pequenos reparos" },
];

const steps = [
  ["01", "Conte o que precisa", "Escolha a categoria, descreva o serviço e informe sua região."],
  ["02", "Receba propostas", "Profissionais disponíveis enviam preço, prazo e uma mensagem para você."],
  ["03", "Compare e escolha", "Veja perfil, distância e avaliações antes de decidir."],
  ["04", "Acompanhe até o fim", "Converse, agende e mantenha todo o histórico no mesmo lugar."],
];

export default function Home() {
  return (
    <main>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="site-header" aria-label="Navegação principal">
        <Link className="brand-lockup" href="/" aria-label="Max Service - início">
          <Image src="/max-service-mark.png" alt="" width={54} height={54} priority />
          <span><strong>MAX</strong> SERVICE</span>
        </Link>
        <nav className="desktop-nav" aria-label="Seções">
          <a href="#servicos">Serviços</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#profissionais">Para profissionais</a>
        </nav>
        <div className="header-actions">
          <Link className="text-link" href="/demo">Entrar</Link>
          <Link className="button button-small" href="/demo">Pedir serviço</Link>
        </div>
      </header>

      <section className="hero" id="conteudo">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><span /> Profissionais da sua região</p>
            <h1>Serviço bem feito começa com a <em>escolha certa.</em></h1>
            <p className="hero-lede">
              Encontre profissionais, compare propostas e acompanhe tudo com clareza — do primeiro contato à avaliação final.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/demo">Encontrar um profissional <span aria-hidden="true">→</span></Link>
              <a className="button button-ghost" href="#profissionais">Quero prestar serviços</a>
            </div>
            <ul className="trust-list" aria-label="Benefícios">
              <li><span aria-hidden="true">✓</span> Perfis analisados</li>
              <li><span aria-hidden="true">✓</span> Propostas no app</li>
              <li><span aria-hidden="true">✓</span> Histórico organizado</li>
            </ul>
          </div>

          <div className="hero-visual" aria-label="Exemplo de proposta recebida">
            <div className="speed-line speed-line-one" />
            <div className="speed-line speed-line-two" />
            <div className="service-ticket">
              <div className="ticket-top">
                <span className="status-dot" />
                <span>2 propostas recebidas</span>
                <span className="muted">agora</span>
              </div>
              <div className="ticket-request">
                <span className="category-symbol">⚡</span>
                <div><small>Eletricista</small><strong>Troca de chuveiro</strong><span>Jardim Europa · 1,8 km</span></div>
              </div>
              <div className="proposal-card featured">
                <div className="avatar avatar-one" aria-hidden="true">RS</div>
                <div><strong>Rafael S.</strong><span>★ 4,9 · 126 serviços</span></div>
                <div className="price"><small>a partir de</small><strong>R$ 95</strong></div>
              </div>
              <div className="proposal-card">
                <div className="avatar avatar-two" aria-hidden="true">MC</div>
                <div><strong>Márcia C.</strong><span>★ 4,8 · 84 serviços</span></div>
                <div className="price"><small>a partir de</small><strong>R$ 110</strong></div>
              </div>
              <div className="ticket-footer"><span>Compare com calma</span><strong>Ver propostas →</strong></div>
            </div>
            <div className="floating-badge"><span aria-hidden="true">✓</span><div><small>Perfil</small><strong>Analisado</strong></div></div>
          </div>
        </div>
      </section>

      <section className="section section-light" id="servicos">
        <div className="section-heading split-heading">
          <div><p className="eyebrow dark"><span /> Comece por aqui</p><h2>Do que você precisa?</h2></div>
          <p>Escolha uma categoria para começar. No piloto, mantemos um catálogo curto para oferecer uma experiência melhor.</p>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <Link className="category-card" href="/demo" key={category.name}>
              <span className="category-icon" aria-hidden="true">{category.icon}</span>
              <span><strong>{category.name}</strong><small>{category.detail}</small></span>
              <span className="card-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section section-dark" id="como-funciona">
        <div className="section-heading"><p className="eyebrow"><span /> Simples de verdade</p><h2>Você pede. A Max organiza.</h2></div>
        <div className="steps-grid">
          {steps.map(([number, title, copy]) => (
            <article className="step" key={number}>
              <span className="step-number">{number}</span>
              <div className="step-line" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <div className="safety-note">
          <div className="safety-mark" aria-hidden="true">MS</div>
          <div><small>Confiança com transparência</small><strong>Perfis passam por análise antes de receber oportunidades.</strong></div>
          <p>Na fase piloto, a revisão é feita por pessoas. Não usamos biometria, antecedentes automáticos ou score financeiro.</p>
        </div>
      </section>

      <section className="pro-section" id="profissionais">
        <div className="pro-panel">
          <div>
            <p className="eyebrow dark"><span /> Para quem faz acontecer</p>
            <h2>Seu trabalho merece mais oportunidades.</h2>
            <p>Crie seu perfil, escolha onde atende e receba pedidos compatíveis com seus serviços.</p>
            <Link className="button" href="/demo">Conhecer a área do profissional →</Link>
          </div>
          <div className="pro-metrics" aria-label="Benefícios para profissionais">
            <div><strong>01</strong><span>Você decide quais propostas enviar</span></div>
            <div><strong>02</strong><span>Agenda, conversa e histórico organizados</span></div>
            <div><strong>03</strong><span>Regras e valores apresentados antes do aceite</span></div>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <Image src="/max-service-mark.png" alt="" width={90} height={90} />
        <div><p className="eyebrow"><span /> Mais serviço. Mais solução.</p><h2>Vamos resolver?</h2></div>
        <Link className="button" href="/demo">Abrir demonstração →</Link>
      </section>

      <footer>
        <div className="footer-brand"><strong>MAX</strong> SERVICE <span>Produto em validação · piloto regional</span></div>
        <p>© 2026 Max Service. Esta demonstração usa dados fictícios e não processa pagamentos.</p>
      </footer>
    </main>
  );
}
