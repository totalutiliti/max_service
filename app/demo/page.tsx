import type { Metadata } from "next";
import { DemoExperience } from "./demo-experience";

export const metadata: Metadata = {
  title: "Plataforma SaaS",
  description: "Conheça os painéis de cliente, profissional, parceiro e administração da Max Service.",
};

export default function DemoPage() {
  return <DemoExperience />;
}
