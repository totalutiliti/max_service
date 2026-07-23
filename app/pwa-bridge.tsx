"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaBridge() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    };
    const offerInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => setInstallPrompt(null);

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    window.addEventListener("beforeinstallprompt", offerInstall);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("load", register);
      window.removeEventListener("beforeinstallprompt", offerInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (!installPrompt) return null;
  return (
    <aside className="pwa-install-prompt" aria-live="polite">
      <Image src="/max-service-mark-192.png" alt="" width={52} height={52} />
      <div>
        <small>ACESSO MAIS RÁPIDO</small>
        <strong>Instale a Max Service</strong>
        <span>Abra como aplicativo, direto da sua tela inicial.</span>
      </div>
      <button className="pwa-install-action" type="button" onClick={install}>Instalar</button>
      <button className="pwa-install-dismiss" type="button" onClick={() => setInstallPrompt(null)} aria-label="Agora não">×</button>
    </aside>
  );
}
