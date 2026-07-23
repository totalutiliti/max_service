import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ReferralCaptureForm } from "./referral-capture";

export const metadata: Metadata = {
  title: "Convite de parceiro",
  description: "Cadastre seu interesse em receber oportunidades como profissional na Max Service.",
  robots: { index: false, follow: false },
};

export default async function ReferralInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string | string[]; origem?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const rawCode = Array.isArray(parameters.codigo) ? parameters.codigo[0] : parameters.codigo;
  const code = rawCode?.trim().toUpperCase() ?? "";
  const rawSource = Array.isArray(parameters.origem) ? parameters.origem[0] : parameters.origem;
  const source = rawSource === "qr" ? "qr" : "link";

  return (
    <main className="referral-public-page">
      <a className="skip-link" href="#cadastro">Pular para o cadastro</a>
      <header className="referral-public-header">
        <Link className="brand-lockup" href="/" aria-label="Max Service - início">
          <Image src="/max-service-mark.png" alt="" width={52} height={52} priority />
          <span><strong>MAX</strong> SERVICE</span>
        </Link>
        <Link className="text-link" href="/">Conhecer a Max Service</Link>
      </header>

      <section className="referral-public-shell">
        <div className="referral-public-story">
          <p className="eyebrow"><span /> Convite de parceiro</p>
          <h1>Transforme sua experiência em <em>novas oportunidades.</em></h1>
          <p className="referral-public-lede">
            Um parceiro local indicou você para conhecer a Max Service. Registre seu interesse e escolha a categoria em que atua.
          </p>
          <div className="referral-public-code">
            <span>INDICAÇÃO IDENTIFICADA</span>
            <strong>{code || "CÓDIGO AUSENTE"}</strong>
          </div>
          <ul className="referral-public-benefits">
            <li><i>01</i><span><strong>Você mantém o controle</strong>Decida quais oportunidades deseja avaliar.</span></li>
            <li><i>02</i><span><strong>Informação organizada</strong>Propostas, conversas e agenda em um só lugar.</span></li>
            <li><i>03</i><span><strong>Piloto transparente</strong>Nenhuma cobrança ou pagamento é realizado neste cadastro.</span></li>
          </ul>
        </div>

        <ReferralCaptureForm code={code} source={source} />
      </section>

      <footer className="referral-public-footer">
        <span>Max Service · produto em validação regional</span>
        <p>Este cadastro registra apenas seu interesse. A entrada na plataforma depende de análise posterior.</p>
      </footer>
    </main>
  );
}
