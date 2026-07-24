import { expect, test } from "@playwright/test";
import { enterDemo } from "./marketplace-helpers";

test("publica uma campanha segmentada e mostra o monitoramento operacional", async ({ page }) => {
  await enterDemo(page, "operacao");
  await page.getByTestId("desktop-section-conta").click();
  await expect(page.getByTestId("desktop-section-conta")).toHaveAttribute("aria-current", "page");

  await expect(page.getByRole("heading", { name: "Campanhas e cupons" })).toBeVisible();
  const monitoring = page.getByTestId("campaign-monitoring");
  await expect(monitoring).toBeVisible();
  await expect(monitoring).toContainText("Sem decisão automática");

  await page.getByRole("button", { name: "Nova campanha +" }).click();
  const dialog = page.getByTestId("campaign-create-dialog");
  await expect(dialog).toBeVisible();

  const code = `E2E${Date.now().toString(36).toUpperCase()}`;
  await dialog.getByLabel("Nome da campanha").fill("Campanha E2E consentida");
  await dialog.getByLabel("Código").fill(code);
  await dialog.getByLabel("Descrição para o cliente").fill(
    "Benefício sintético para validar o público consentido da campanha.",
  );
  await dialog.getByLabel("Critério de público").selectOption("consented");
  await dialog.getByLabel("Categoria-alvo").selectOption({ index: 1 });
  await dialog.getByLabel("Região-alvo").selectOption({ index: 1 });
  await dialog.getByLabel("Justificativa operacional").fill(
    "Campanha sintética criada no E2E para comprovar segmentação e auditoria.",
  );
  await dialog.getByRole("button", { name: "Publicar e auditar →" }).click();
  await expect(dialog).toBeHidden();

  const campaign = page.getByTestId("campaign-record").filter({ hasText: code });
  await expect(campaign).toBeVisible();
  await expect(campaign).toContainText("consentimento promocional obrigatório");
  await expect(campaign).toContainText("Fluxo normal");
});
