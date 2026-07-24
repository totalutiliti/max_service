import { expect, type Page } from "@playwright/test";

export type DemoProfile = "cliente" | "prestador" | "parceiro" | "operacao";

export async function enterDemo(page: Page, profile: DemoProfile) {
  await page.goto("/demo");
  await expect(page.getByTestId("access-screen")).toBeVisible();
  await page.getByTestId(`access-role-${profile}`).click();
  await page.getByTestId("access-submit").click();
  await expect(page.getByTestId("demo-shell")).toBeVisible();
  await expect(page.getByTestId("role-switcher")).toHaveValue(profile);
}

export async function switchProfile(page: Page, profile: DemoProfile) {
  await page.getByTestId("role-switcher").selectOption(profile);
  await expect(page.getByTestId("role-switcher")).toHaveValue(profile);
  await expect(page.getByTestId("desktop-section-inicio")).toHaveAttribute("aria-current", "page");
}

export async function openSection(page: Page, section: "atividade" | "mensagens") {
  const navigationItem = page.getByTestId(`desktop-section-${section}`);
  await navigationItem.click();
  await expect(navigationItem).toHaveAttribute("aria-current", "page");
}

export async function scheduleMarketplaceService(page: Page, requestTitle: string) {
  await enterDemo(page, "cliente");

  await page.getByTestId("new-service-request").click();
  const requestDialog = page.getByTestId("service-request-dialog");
  await expect(requestDialog).toBeVisible();
  await requestDialog.getByRole("button", { name: /Continuar/ }).click();
  await requestDialog.getByLabel("O que precisa ser feito?").fill(requestTitle);
  await requestDialog.getByRole("button", { name: /Continuar/ }).click();
  await requestDialog.getByRole("button", { name: /Continuar/ }).click();
  await requestDialog.getByRole("button", { name: "Confirmar e acompanhar" }).click();
  await expect(requestDialog).toBeHidden();

  await switchProfile(page, "prestador");
  await page.getByTestId("opportunity-search").fill(requestTitle);
  const opportunity = page.getByTestId("provider-opportunity").filter({ hasText: requestTitle });
  await expect(opportunity).toBeVisible();
  await opportunity.getByRole("button", { name: "Enviar proposta" }).click();

  const proposalDialog = page.getByTestId("proposal-dialog");
  await expect(proposalDialog).toContainText(requestTitle);
  await proposalDialog.getByLabel("Valor da proposta").fill("189.90");
  await proposalDialog.getByLabel("Tempo estimado").selectOption("90");
  await proposalDialog.getByLabel("Mensagem para o cliente").fill("Tenho disponibilidade e levarei todas as ferramentas necessárias.");
  await proposalDialog.getByRole("button", { name: /Enviar proposta/ }).click();
  await expect(proposalDialog).toBeHidden();

  await switchProfile(page, "cliente");
  await openSection(page, "atividade");
  await page.getByPlaceholder("Código, serviço ou pessoa").fill(requestTitle);
  const requestRecord = page.getByTestId("request-record").filter({ hasText: requestTitle });
  await expect(requestRecord).toContainText("1 proposta");
  await requestRecord.click();

  const comparisonDialog = page.getByTestId("proposal-comparison-dialog");
  const proposalCard = comparisonDialog.getByTestId("proposal-card").filter({ hasText: "Rafael Santos" });
  await expect(proposalCard).toContainText("R$ 189,90");
  await proposalCard.getByRole("button", { name: "Ver horários" }).click();
  await expect(proposalCard.getByRole("button", { name: "Confirmar profissional e horário" })).toBeEnabled();
  await proposalCard.getByRole("button", { name: "Confirmar profissional e horário" }).click();
  await expect(proposalCard).toContainText("Escolhida");
  await comparisonDialog.locator(".comparison-footer").getByRole("button", { name: "Fechar" }).click();
}
