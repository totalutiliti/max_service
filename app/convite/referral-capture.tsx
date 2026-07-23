"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ReferralCategory {
  slug: string;
  name: string;
  icon: string;
}

interface ReferralDetails {
  referralCode: string;
  privacyNoticeVersion: string;
  categories: ReferralCategory[];
}

export function ReferralCaptureForm({ code, source }: { code: string; source: "link" | "qr" }) {
  const validCode = /^PC-[A-Z0-9]{4,16}$/.test(code);
  const [details, setDetails] = useState<ReferralDetails | null>(null);
  const [loading, setLoading] = useState(validCode);
  const [error, setError] = useState(validCode ? "" : "Este link de indicação está incompleto ou é inválido.");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!validCode) return;
    const controller = new AbortController();
    fetch(`/api/v1/public/referrals?code=${encodeURIComponent(code)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as ReferralDetails & { error?: string; message?: string };
        if (!response.ok || !payload.referralCode) {
          throw new Error(payload.error ?? payload.message ?? "Este convite não está mais disponível.");
        }
        return payload;
      })
      .then((payload) => {
        setDetails(payload);
        setCategorySlug(payload.categories[0]?.slug ?? "");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Não foi possível validar este convite.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [code, validCode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
      const response = await fetch("/api/v1/public/referrals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          professionalName: name.trim(),
          email: email.trim(),
          categorySlug,
          source,
          consent,
          website: String(form.get("website") ?? ""),
        }),
      });
      const payload = await response.json() as { accepted?: boolean; error?: string; message?: string };
      if (!response.ok || !payload.accepted) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível registrar seu interesse.");
      }
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível registrar seu interesse.");
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <section className="referral-public-card referral-public-success" id="cadastro" aria-live="polite">
        <span className="referral-success-mark">✓</span>
        <small>INTERESSE REGISTRADO</small>
        <h2>Obrigado, {name.trim().split(" ")[0]}.</h2>
        <p>Seu cadastro ficou vinculado à indicação <strong>{details?.referralCode}</strong>. A próxima etapa será conduzida pela equipe do piloto.</p>
        <div className="referral-public-notice">
          Nenhum e-mail automático, cobrança ou movimentação financeira foi realizado.
        </div>
        <Link className="button" href="/">Conhecer a Max Service →</Link>
      </section>
    );
  }

  return (
    <section className="referral-public-card" id="cadastro">
      <header>
        <small>CADASTRO DE INTERESSE</small>
        <h2>Conte como você trabalha.</h2>
        <p>Leva menos de um minuto e não cria uma conta definitiva.</p>
      </header>

      {loading && <div className="referral-public-state"><span className="live-dot" /> Validando o convite...</div>}
      {!loading && error && !details && (
        <div className="referral-public-invalid" role="alert">
          <span>!</span>
          <div><strong>Convite indisponível</strong><p>{error}</p></div>
        </div>
      )}
      {!loading && details && (
        <form onSubmit={submit}>
          <label className="field">
            <span>Nome completo</span>
            <input
              autoComplete="name"
              minLength={3}
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Como devemos chamar você?"
              required
            />
          </label>
          <label className="field">
            <span>E-mail para contato</span>
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@exemplo.com"
              required
            />
          </label>
          <label className="field">
            <span>Categoria principal</span>
            <select value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)} required>
              {details.categories.map((category) => (
                <option value={category.slug} key={category.slug}>{category.icon} {category.name}</option>
              ))}
            </select>
          </label>
          <label className="referral-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
            <span>
              Autorizo o uso destes dados para contato sobre o piloto Max Service. O registro de consentimento usa o aviso <strong>{details.privacyNoticeVersion}</strong>.
            </span>
          </label>
          <label className="referral-honeypot" aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          {error && <p className="referral-form-error" role="alert">{error}</p>}
          <button
            className="button referral-submit"
            disabled={saving || name.trim().length < 3 || !email.includes("@") || !categorySlug || !consent}
          >
            {saving ? "Registrando..." : "Registrar meu interesse →"}
          </button>
          <p className="referral-form-footnote">Seus dados não são vendidos e não são usados para score, crédito ou consulta automática de antecedentes.</p>
        </form>
      )}
    </section>
  );
}
