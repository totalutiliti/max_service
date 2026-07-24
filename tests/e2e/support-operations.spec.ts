import { expect, test } from "@playwright/test";
import { enterDemo, openSection, switchProfile } from "./marketplace-helpers";

test("mantém o atendimento do parceiro até a resolução pela operação", async ({ page }) => {
  test.setTimeout(90_000);

  const sequence = Date.now();
  const subject = `Atendimento E2E ${sequence}`;
  const initialMessage = `Solicitação sintética aberta para validar o fluxo ${sequence}.`;
  const partnerFollowUp = `Parceiro acrescentou contexto ao atendimento ${sequence}.`;
  const triageNote = `Atendimento ${sequence} atribuído à equipe responsável pelo piloto.`;
  const analysisNote = `Atendimento ${sequence} assumido para análise operacional.`;
  const operationReply = `Operação respondeu ao parceiro no atendimento ${sequence}.`;
  const resolutionNote = `Atendimento ${sequence} resolvido com orientação registrada no histórico.`;

  await enterDemo(page, "parceiro");
  await openSection(page, "mensagens");
  await page.getByTestId("new-support-case").click();

  const createDialog = page.getByTestId("support-create-dialog");
  await createDialog.getByLabel("Assunto do atendimento").selectOption("other");
  await createDialog.getByLabel("Título").fill(subject);
  await createDialog.getByLabel("Mensagem inicial").fill(initialMessage);
  await createDialog.getByRole("button", { name: "Abrir solicitação" }).click();
  await expect(createDialog).toBeHidden();

  await page.getByLabel("Buscar atendimento").fill(subject);
  const partnerCase = page.getByTestId("support-case-record").filter({ hasText: subject });
  await expect(partnerCase).toContainText("Aberto");
  await partnerCase.click();

  const partnerThread = page.getByTestId("support-thread");
  await expect(partnerThread).toContainText(initialMessage);
  await partnerThread.getByLabel("Mensagem do atendimento").fill(partnerFollowUp);
  await partnerThread.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(partnerThread.locator(".partner-support-events")).toContainText(partnerFollowUp);

  await switchProfile(page, "operacao");
  await openSection(page, "mensagens");
  await page.getByLabel("Buscar atendimento").fill(subject);
  const operationCase = page.getByTestId("support-case-record").filter({ hasText: subject });
  await expect(operationCase).toContainText("Aberto");
  await operationCase.click();

  const operationThread = page.getByTestId("support-thread");
  await expect(operationThread).toContainText(partnerFollowUp);
  await operationThread.getByLabel("Prioridade").selectOption("high");
  await operationThread.getByLabel("Justificativa da triagem").fill(triageNote);
  await operationThread.getByRole("button", { name: "Registrar triagem" }).click();
  await expect(operationThread).toContainText("Prioridade alta");
  await expect(operationThread.locator(".support-sla-overview")).not.toContainText("Não atribuído");
  await expect(operationThread.locator(".partner-support-events")).toContainText(triageNote);

  await operationThread.locator(".support-transition textarea").fill(analysisNote);
  await operationThread.getByRole("button", { name: "Assumir análise" }).click();
  await expect(operationThread.locator(".support-header-badges .status-pill")).toHaveText("Em análise");
  await expect(operationThread.locator(".partner-support-events")).toContainText(analysisNote);

  await operationThread.getByLabel("Mensagem do atendimento").fill(operationReply);
  await operationThread.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(operationThread.locator(".partner-support-events")).toContainText(operationReply);

  await operationThread.locator(".support-transition textarea").fill(resolutionNote);
  await operationThread.getByRole("button", { name: "Resolver atendimento" }).click();
  await expect(operationThread.locator(".support-header-badges .status-pill")).toHaveText("Resolvido");
  await expect(operationThread.locator(".support-resolution")).toContainText(resolutionNote);

  await switchProfile(page, "parceiro");
  await openSection(page, "mensagens");
  await page.getByLabel("Buscar atendimento").fill(subject);
  const resolvedCase = page.getByTestId("support-case-record").filter({ hasText: subject });
  await expect(resolvedCase).toContainText("Resolvido");
  await resolvedCase.click();
  await expect(page.getByTestId("support-thread")).toContainText(operationReply);
  await expect(page.getByTestId("support-thread").locator(".support-resolution")).toContainText(resolutionNote);
});
