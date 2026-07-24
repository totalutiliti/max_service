import { expect, test } from "@playwright/test";
import { openSection, scheduleMarketplaceService, switchProfile } from "./marketplace-helpers";

test("encaminha um cancelamento para tratamento auditável pela operação", async ({ page }) => {
  test.setTimeout(90_000);

  const requestTitle = `Exceção E2E ${Date.now()} - revisar instalação`;
  const cancellationDetails = `Cliente indisponível para a visita da ${requestTitle}.`;
  const analysisNote = `Contato conferido e ocorrência da ${requestTitle} assumida pela equipe.`;
  const resolutionNote = `Ocorrência da ${requestTitle} resolvida após orientação aos participantes.`;

  await scheduleMarketplaceService(page, requestTitle);

  await page.getByPlaceholder("Código, serviço ou pessoa").fill(requestTitle);
  const customerBooking = page.getByTestId("booking-record").filter({ hasText: requestTitle });
  await expect(customerBooking).toContainText("Agendado");
  await customerBooking.click();

  const bookingDialog = page.getByTestId("booking-dialog");
  await bookingDialog.getByRole("button", { name: "Solicitar cancelamento" }).click();
  const cancellationForm = bookingDialog.getByTestId("cancellation-form");
  await cancellationForm.getByLabel("Motivo").selectOption("participant_unavailable");
  await cancellationForm.getByLabel("Explique o ocorrido").fill(cancellationDetails);
  await cancellationForm.getByRole("button", { name: "Confirmar cancelamento" }).click();

  await expect(bookingDialog.locator(".booking-dialog-header .status-pill")).toHaveText("Cancelado");
  await expect(bookingDialog.getByTestId("cancellation-summary")).toContainText(cancellationDetails);
  await expect(bookingDialog.getByTestId("cancellation-summary")).toContainText("Ocorrência aberta");
  await bookingDialog.getByRole("button", { name: "Fechar" }).click();

  await switchProfile(page, "operacao");
  const caseRecord = page.getByTestId("operation-case-record").filter({ hasText: cancellationDetails });
  await expect(caseRecord).toContainText("Aberto");
  await caseRecord.getByRole("button").click();

  const caseDialog = page.getByTestId("operation-case-dialog");
  await expect(caseDialog).toContainText(requestTitle);
  await expect(caseDialog.locator(".operation-case-header .status-pill")).toHaveText("Aberto");
  await caseDialog.getByLabel("Nota ou justificativa").fill(analysisNote);
  await caseDialog.getByRole("button", { name: "Assumir análise" }).click();
  await expect(caseDialog.locator(".operation-case-header .status-pill")).toHaveText("Em análise");
  await expect(caseDialog.locator(".operation-timeline")).toContainText(analysisNote);

  await caseDialog.getByLabel("Nota ou justificativa").fill(resolutionNote);
  await caseDialog.getByRole("button", { name: "Resolver chamado" }).click();
  await expect(caseDialog.locator(".operation-case-header .status-pill")).toHaveText("Resolvido");
  await expect(caseDialog.locator(".operation-resolution")).toContainText(resolutionNote);

  await switchProfile(page, "cliente");
  await openSection(page, "atividade");
  await page.getByPlaceholder("Código, serviço ou pessoa").fill(requestTitle);
  const resolvedBooking = page.getByTestId("booking-record").filter({ hasText: requestTitle });
  await expect(resolvedBooking).toContainText("Cancelado");
  await resolvedBooking.click();
  await expect(page.getByTestId("cancellation-summary")).toContainText("Ocorrência resolvida");
});
