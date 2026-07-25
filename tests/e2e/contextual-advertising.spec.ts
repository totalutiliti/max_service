import { expect, test } from "@playwright/test";
import { enterDemo, switchProfile } from "./marketplace-helpers";

test("anunciante envia peça, operação modera e cliente recebe anúncio explicado", async ({ page }) => {
  await enterDemo(page, "anunciante");
  await expect(page.getByTestId("advertiser-campaigns")).toBeVisible();
  await page.getByTestId("new-contextual-ad").click();

  const dialog = page.getByTestId("contextual-ad-create-dialog");
  const sequence = Date.now().toString(36).toUpperCase();
  const headline = `Oferta hidráulica ${sequence}`;
  await dialog.getByLabel("Nome interno").fill(`Campanha contextual ${sequence}`);
  await dialog.getByLabel("Chamada").fill(headline);
  await dialog.getByLabel("Texto da peça").fill("Materiais sintéticos para manutenção hidráulica residencial no contexto selecionado.");
  await dialog.getByLabel("Texto do botão").fill("Ver materiais");
  await dialog.getByLabel("Destino HTTPS").fill("https://example.com/oferta-hidraulica");
  const categorySelect = dialog.getByLabel("Categoria");
  const categoryId = await categorySelect.locator("option").filter({ hasText: "Encanador" }).getAttribute("value");
  expect(categoryId).toBeTruthy();
  await categorySelect.selectOption(categoryId!);
  await dialog.getByLabel("Região").selectOption({ index: 1 });
  await dialog.getByLabel("Contexto para moderação").fill(
    "Peça sintética para validar moderação humana, transparência e seleção exclusivamente contextual.",
  );
  await dialog.getByRole("button", { name: /Enviar para revisão/ }).click();
  await expect(dialog).toBeHidden();

  const advertiserCampaign = page.getByTestId("advertiser-campaign-record").filter({ hasText: headline });
  await expect(advertiserCampaign).toBeVisible();
  await expect(advertiserCampaign).toContainText("Aguardando revisão");

  await switchProfile(page, "operacao");
  await page.getByTestId("desktop-section-conta").click();
  const moderation = page.getByTestId("advertising-moderation");
  await expect(moderation).toBeVisible();
  const reviewRecord = moderation.getByTestId("advertising-review-record").filter({ hasText: headline });
  await expect(reviewRecord).toBeVisible();
  await reviewRecord.getByRole("button", { name: "Aprovar peça" }).click();

  const moderationDialog = page.getByTestId("contextual-ad-moderation-dialog");
  await moderationDialog.getByLabel("Justificativa da decisão").fill(
    "Conteúdo, destino HTTPS e contexto de encanador em Sorocaba revisados conforme a política vigente.",
  );
  await moderationDialog.getByRole("button", { name: /Aprovar e auditar/ }).click();
  await expect(moderationDialog).toBeHidden();
  await expect(reviewRecord).toContainText("No ar");

  await switchProfile(page, "cliente");
  await page.getByTestId("new-service-request").click();
  const requestDialog = page.getByTestId("service-request-dialog");
  await requestDialog.getByRole("button", { name: /Encanador/ }).click();
  await requestDialog.getByRole("button", { name: /Continuar/ }).click();
  await requestDialog.getByLabel("O que precisa ser feito?").fill(
    "Preciso revisar um vazamento sintético na cozinha para comparar propostas.",
  );
  await requestDialog.getByRole("button", { name: /Continuar/ }).click();

  const contextualAd = requestDialog.getByTestId("contextual-ad");
  await expect(contextualAd).toBeVisible();
  await expect(contextualAd).toContainText(headline);
  await expect(contextualAd).toContainText("Patrocinado");
  await contextualAd.getByText("Por que estou vendo isto?").click();
  await expect(contextualAd).toContainText("Nenhum histórico pessoal foi usado");
});
