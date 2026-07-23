import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaBridge } from "./pwa-bridge";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:4174"),
  title: { default: "Max Service", template: "%s | Max Service" },
  description: "Mais serviço pra quem trabalha. Solução pra quem precisa.",
  applicationName: "Max Service",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/max-service-mark-192.png", type: "image/png", sizes: "192x192" },
      { url: "/max-service-mark-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/max-service-mark-192.png", type: "image/png", sizes: "192x192" }],
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Max Service",
    title: "Max Service",
    description: "Mais serviço pra quem trabalha. Solução pra quem precisa.",
    images: [{ url: "/og.png", width: 1740, height: 908, alt: "Max Service — mais serviço pra quem trabalha, solução pra quem precisa" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Max Service",
    description: "Mais serviço pra quem trabalha. Solução pra quem precisa.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = { themeColor: "#080b09", colorScheme: "dark light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
        <PwaBridge />
      </body>
    </html>
  );
}
