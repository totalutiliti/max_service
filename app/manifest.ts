import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/demo",
    name: "Max Service",
    short_name: "Max Service",
    description: "Encontre profissionais, compare propostas e acompanhe seus serviços em um só lugar.",
    start_url: "/demo?origem=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#080b09",
    theme_color: "#080b09",
    lang: "pt-BR",
    categories: ["business", "lifestyle", "utilities"],
    icons: [
      {
        src: "/max-service-mark-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/max-service-mark-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
    shortcuts: [
      {
        name: "Abrir plataforma",
        short_name: "Plataforma",
        description: "Acesse os painéis da Max Service.",
        url: "/demo?origem=atalho",
        icons: [{ src: "/max-service-mark-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Indicar profissional",
        short_name: "Indicar",
        description: "Abra a página pública de indicação.",
        url: "/convite?origem=atalho",
        icons: [{ src: "/max-service-mark-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
