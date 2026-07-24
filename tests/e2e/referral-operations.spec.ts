import { expect, test } from "@playwright/test";
import { enterDemo, openSection, switchProfile } from "./marketplace-helpers";

test("leva uma indicação do parceiro até a aprovação operacional", async ({ page }) => {
  test.setTimeout(90_000);

  const sequence = Date.now();
  const professionalName = `Profissional E2E ${sequence}`;
  const professionalEmail = `joao+e2e.${sequence}@demo.maxservice`;
  const analysisNote = `Origem e dados sintéticos de ${professionalName} conferidos pela Operação.`;
  const riskNote = `A variação de e-mail foi conferida e liberada manualmente para o cenário E2E ${sequence}.`;
  const approvalNote = `${professionalName} aprovado para iniciar o onboarding demonstrativo.`;

  await enterDemo(page, "parceiro");
  await page.getByTestId("new-referral").click();

  const inviteDialog = page.getByTestId("referral-invite-dialog");
  await inviteDialog.getByLabel("Nome do profissional").fill(professionalName);
  await inviteDialog.getByLabel("E-mail").fill(professionalEmail);
  await expect(inviteDialog.getByLabel("Categoria principal")).toBeEnabled();
  await inviteDialog.getByRole("button", { name: /Registrar indicação/ }).click();
  await expect(inviteDialog).toBeHidden();

  await openSection(page, "atividade");
  await page.getByPlaceholder("Código, profissional, e-mail ou categoria").fill(professionalEmail);
  const partnerRecord = page.getByTestId("partner-referral-record").filter({ hasText: professionalEmail });
  await expect(partnerRecord).toContainText("Convidado");
  await expect(partnerRecord).toContainText("verificação adicional");

  await switchProfile(page, "operacao");
  const operationRecord = page.getByTestId("operation-referral-record").filter({ hasText: professionalName });
  await expect(operationRecord).toContainText("Convidado");
  await operationRecord.getByRole("button").click();

  const referralDialog = page.getByTestId("operation-referral-dialog");
  await expect(referralDialog).toContainText(professionalEmail);
  await expect(referralDialog.locator(".operation-case-header .status-pill")).toHaveText("Convidado");
  await expect(referralDialog.getByTestId("referral-risk-panel")).toContainText("Risco alto");
  await expect(referralDialog.getByTestId("referral-risk-panel")).toContainText("Possível autorreferência");
  await referralDialog.getByLabel("Nota da análise").fill(analysisNote);
  await referralDialog.getByRole("button", { name: "Iniciar análise" }).click();
  await expect(referralDialog.locator(".operation-case-header .status-pill")).toHaveText("Em análise");
  await expect(referralDialog.locator(".operation-timeline")).toContainText(analysisNote);

  await expect(referralDialog.getByRole("button", { name: "Aprovar para onboarding" })).toBeDisabled();
  await referralDialog.getByLabel("Conclusão da verificação adicional").fill(riskNote);
  await referralDialog.getByRole("button", { name: "Liberar triagem" }).click();
  await expect(referralDialog.getByTestId("referral-risk-panel")).toContainText("Sinais esclarecidos");

  await referralDialog.getByLabel("Nota da análise").fill(approvalNote);
  await referralDialog.getByRole("button", { name: "Aprovar para onboarding" }).click();
  await expect(referralDialog.locator(".operation-case-header .status-pill")).toHaveText("Aprovado p/ onboarding");
  await expect(referralDialog.locator(".operation-resolution")).toContainText(approvalNote);

  await switchProfile(page, "parceiro");
  await openSection(page, "atividade");
  await page.getByPlaceholder("Código, profissional, e-mail ou categoria").fill(professionalEmail);
  await expect(page.getByTestId("partner-referral-record").filter({ hasText: professionalEmail })).toContainText("Aprovado p/ onboarding");
});
