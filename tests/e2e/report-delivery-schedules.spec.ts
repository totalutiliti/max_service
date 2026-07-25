import { expect, test } from "@playwright/test";
import { enterDemo } from "./marketplace-helpers";

test("operação agenda, simula e pausa entrega consentida de relatório", async ({ page }) => {
  await enterDemo(page, "operacao");
  const panel = page.getByTestId("report-delivery-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Provedor externo bloqueado");
  await page.getByTestId("report-schedule-create").click();

  const dialog = page.getByTestId("report-schedule-dialog");
  const sequence = Date.now().toString(36).toUpperCase();
  const label = `Resumo E2E ${sequence}`;
  const nextRun = new Date(Date.now() + 15 * 86_400_000);
  nextRun.setSeconds(0, 0);
  const localNextRun = new Date(
    nextRun.getTime() - nextRun.getTimezoneOffset() * 60_000,
  ).toISOString().slice(0, 16);

  await dialog.getByLabel("Nome do agendamento").fill(label);
  await dialog.getByLabel("Janela do relatório").selectOption("7");
  await dialog.locator(".report-schedule-fields select").nth(1).selectOption("weekly");
  await dialog.getByLabel("Próxima execução").fill(localNextRun);
  await dialog.getByLabel("Nome do destinatário").fill("Operação E2E");
  await dialog.getByLabel("E-mail sintético").fill("e2e@example.test");
  await dialog.locator("textarea").fill(
    "Validar o ciclo consentido, agregado e auditável do relatório operacional.",
  );
  await dialog.getByLabel(/Confirmo o consentimento/).check();
  await page.getByTestId("report-schedule-submit").click();
  await expect(dialog).toBeHidden();

  const schedule = panel.locator(".report-schedule-grid > article").filter({ hasText: label });
  await expect(schedule).toBeVisible();
  await expect(schedule).toContainText("e***@example.test");
  await expect(schedule).toContainText("Ativo");
  await schedule.getByRole("button", { name: "Simular entrega →" }).click();

  const delivery = panel.locator(".report-delivery-history > article").filter({ hasText: label });
  await expect(delivery).toBeVisible();
  await expect(delivery).toContainText("sha256:");
  await expect(delivery).toContainText("e***@example.test");

  await schedule.getByRole("button", { name: "Pausar" }).click();
  await expect(schedule).toContainText("Pausado");
  await expect(schedule.getByRole("button", { name: "Simular entrega →" })).toBeDisabled();
});
