import { expect, test } from "@playwright/test";
import { openSection, scheduleMarketplaceService, switchProfile } from "./marketplace-helpers";

test("conduz o serviço do pedido à avaliação usando somente a interface", async ({ page }) => {
  test.setTimeout(90_000);

  const requestTitle = `Jornada E2E ${Date.now()} - instalar luminária`;
  const customerMessage = `Mensagem do cliente para ${requestTitle}`;
  const providerMessage = `Confirmação do profissional para ${requestTitle}`;
  const reviewComment = `Atendimento concluído com sucesso na ${requestTitle}.`;

  await scheduleMarketplaceService(page, requestTitle);

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
