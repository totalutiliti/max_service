import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Max Service",
    short_name: "Max Service",
    description: "Encontre serviços e profissionais da sua região.",
    start_url: "/",
    display: "standalone",
    background_color: "#080b09",
    theme_color: "#75e600",
    lang: "pt-BR",
    icons: [{ src: "/max-service-mark.png", sizes: "704x704", type: "image/png" }],
  };
}
