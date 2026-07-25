import { expect, test } from "@playwright/test";
import { enterDemo, switchProfile } from "./marketplace-helpers";

test("titular exporta seus dados e Operação conduz pedido de correção", async ({ page }) => {
  const sequence = Date.now().toString(36);
  await enterDemo(page, "cliente");
  await page.getByTestId("desktop-section-conta").click();

  const center = page.getByTestId("privacy-center");
  await expect(center).toBeVisible();
  await expect(center).toContainText("Sem exclusão automática");

  const accessDescription = `Quero receber meu pacote estruturado do teste ${sequence}, sem dados de terceiros.`;
  const form = page.getByTestId("privacy-request-form");
  await form.getByLabel("Direito solicitado").selectOption("access");
  await form.getByLabel("Detalhes da solicitação").fill(accessDescription);
  await form.getByLabel(/Confirmo que esta solicitação/).check();
  await form.getByRole("button", { name: "Registrar solicitação →" }).click();

  const accessRequest = center.locator(".privacy-request").filter({ hasText: accessDescription });
  await expect(accessRequest).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await accessRequest.getByTestId("privacy-export").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^max-service-privacidade-DS-[A-Z0-9]+\.json$/);
  await expect(accessRequest).toContainText("Atendida");
  await expect(accessRequest).toContainText("PX-");

  const correctionDescription = `Preciso corrigir o campo de perfil demonstrativo identificado no teste ${sequence}.`;
  await form.getByLabel("Direito solicitado").selectOption("correction");
  await form.getByLabel("Detalhes da solicitação").fill(correctionDescription);
  await form.getByLabel(/Confirmo que esta solicitação/).check();
  await form.getByRole("button", { name: "Registrar solicitação →" }).click();

  const correctionRequest = center.locator(".privacy-request").filter({ hasText: correctionDescription });
  await expect(correctionRequest).toContainText("Recebida");
  const requestCodeText = await correctionRequest.locator("header small").textContent();
  const requestCode = requestCodeText?.split(" · ")[0] ?? "";
  expect(requestCode).toMatch(/^DS-[A-Z0-9]+$/);

  await switchProfile(page, "operacao");
  await page.getByTestId("desktop-section-conta").click();
  const queue = page.getByTestId("operation-privacy-queue");
  await expect(queue).toBeVisible();
  await queue.locator(".operation-privacy-list > button").filter({ hasText: requestCode }).click();
  await expect(queue.locator(".operation-privacy-detail")).toContainText(correctionDescription);
  await queue.locator(".operation-privacy-detail textarea").fill(
    "Operação assumiu a correção, confirmou o escopo e preservou a trilha versionada.",
  );
  await queue.locator(".operation-privacy-detail").getByRole("button", { name: "Salvar decisão versionada →" }).click();
  await expect(queue.locator(".operation-privacy-list > button").filter({ hasText: requestCode })).toContainText("Em análise");

  await switchProfile(page, "cliente");
  await page.getByTestId("desktop-section-conta").click();
  await expect(page.getByTestId("privacy-center").locator(".privacy-request").filter({ hasText: correctionDescription })).toContainText("Em análise");
});
