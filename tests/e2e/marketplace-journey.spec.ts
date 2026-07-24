import { expect, test, type Page } from "@playwright/test";

type MarketplaceProfile = "cliente" | "prestador";

async function enterDemo(page: Page, profile: MarketplaceProfile) {
  await page.goto("/demo");
  await expect(page.getByTestId("access-screen")).toBeVisible();
  await page.getByTestId(`access-role-${profile}`).click();
  await page.getByTestId("access-submit").click();
  await expect(page.getByTestId("demo-shell")).toBeVisible();
  await expect(page.getByTestId("role-switcher")).toHaveValue(profile);
}

async function switchProfile(page: Page, profile: MarketplaceProfile) {
  await page.getByTestId("role-switcher").selectOption(profile);
  await expect(page.getByTestId("role-switcher")).toHaveValue(profile);
  await expect(page.getByTestId("desktop-section-inicio")).toHaveAttribute("aria-current", "page");
}

async function openSection(page: Page, section: "atividade" | "mensagens") {
  const navigationItem = page.getByTestId(`desktop-section-${section}`);
  await navigationItem.click();
  await expect(navigationItem).toHaveAttribute("aria-current", "page");
}

test("conduz o serviço do pedido à avaliação usando somente a interface", async ({ page }) => {
  test.setTimeout(90_000);

  const requestTitle = `Jornada E2E ${Date.now()} - instalar luminária`;
  const customerMessage = `Mensagem do cliente para ${requestTitle}`;
  const providerMessage = `Confirmação do profissional para ${requestTitle}`;
  const reviewComment = `Atendimento concluído com sucesso na ${requestTitle}.`;

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

  await openSection(page, "mensagens");
  const customerConversation = page.getByTestId("conversation-item").filter({ hasText: requestTitle });
  await expect(customerConversation).toBeVisible();
  await customerConversation.click();
  await page.getByLabel("Mensagem", { exact: true }).fill(customerMessage);
  await page.locator(".message-composer").getByRole("button", { name: "Enviar" }).click();
  await expect(page.locator(".chat-messages")).toContainText(customerMessage);

  await switchProfile(page, "prestador");
  await openSection(page, "mensagens");
  const providerConversation = page.getByTestId("conversation-item").filter({ hasText: requestTitle });
  await expect(providerConversation).toBeVisible();
  await providerConversation.click();
  await expect(page.locator(".chat-messages")).toContainText(customerMessage);
  await page.getByLabel("Mensagem", { exact: true }).fill(providerMessage);
  await page.locator(".message-composer").getByRole("button", { name: "Enviar" }).click();
  await expect(page.locator(".chat-messages")).toContainText(providerMessage);

  await openSection(page, "atividade");
  await page.getByPlaceholder("Código, serviço ou pessoa").fill(requestTitle);
  const providerBooking = page.getByTestId("booking-record").filter({ hasText: requestTitle });
  await expect(providerBooking).toContainText("Agendado");
  await providerBooking.click();

  const providerBookingDialog = page.getByTestId("booking-dialog");
  await providerBookingDialog.getByRole("button", { name: "Iniciar serviço" }).click();
  await expect(providerBookingDialog.locator(".booking-dialog-header .status-pill")).toHaveText("Em andamento");
  await providerBookingDialog.getByRole("button", { name: "Marcar como concluído" }).click();
  await expect(providerBookingDialog.locator(".booking-dialog-header .status-pill")).toHaveText("Concluído");
  await providerBookingDialog.getByRole("button", { name: "Fechar" }).click();

  await switchProfile(page, "cliente");
  await openSection(page, "mensagens");
  await page.getByTestId("conversation-item").filter({ hasText: requestTitle }).click();
  await expect(page.locator(".chat-messages")).toContainText(providerMessage);

  await openSection(page, "atividade");
  await page.getByPlaceholder("Código, serviço ou pessoa").fill(requestTitle);
  const customerBooking = page.getByTestId("booking-record").filter({ hasText: requestTitle });
  await expect(customerBooking).toContainText("Concluído");
  await customerBooking.click();

  const customerBookingDialog = page.getByTestId("booking-dialog");
  await customerBookingDialog.getByRole("radio", { name: "5 estrelas" }).click();
  await customerBookingDialog.getByLabel("Comentário").fill(reviewComment);
  await customerBookingDialog.getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(customerBookingDialog.locator(".service-reviews")).toContainText(reviewComment);
  await expect(customerBookingDialog).toContainText("Sua avaliação está registrada");
});
