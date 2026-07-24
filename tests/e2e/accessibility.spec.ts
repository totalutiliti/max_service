import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const profiles = ["cliente", "prestador", "parceiro", "operacao"] as const;
const sections = ["inicio", "atividade", "mensagens", "conta"] as const;

type Profile = (typeof profiles)[number];

async function enterDemo(page: Page, profile: Profile) {
  await page.goto("/demo");
  await expect(page.getByTestId("access-screen")).toBeVisible();
  await page.getByTestId(`access-role-${profile}`).click();
  await page.getByTestId("access-submit").click();
  await expect(page.getByTestId("demo-shell")).toBeVisible();
  await expect(page.getByTestId("role-switcher")).toHaveValue(profile);
}

async function expectNoWcagViolations(page: Page, checkpoint: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary, `Violações WCAG em ${checkpoint}`).toEqual([]);
}

test.describe("acesso acessível", () => {
  test("não tem violações WCAG 2.2 AA detectáveis", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByTestId("access-screen")).toBeVisible();
    await expectNoWcagViolations(page, "tela de acesso");
  });

  test("radiogroup troca perfil com setas, Home e End", async ({ page }) => {
    await page.goto("/demo");
    const customer = page.getByTestId("access-role-cliente");
    const provider = page.getByTestId("access-role-prestador");
    const operation = page.getByTestId("access-role-operacao");

    await customer.focus();
    await page.keyboard.press("ArrowRight");
    await expect(provider).toBeFocused();
    await expect(provider).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press("End");
    await expect(operation).toBeFocused();
    await expect(operation).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press("Home");
    await expect(customer).toBeFocused();
    await expect(customer).toHaveAttribute("aria-checked", "true");
  });
});

for (const profile of profiles) {
  test.describe(`perfil ${profile}`, () => {
    test("mantém as quatro áreas sem violações WCAG detectáveis", async ({ page }) => {
      await enterDemo(page, profile);

      for (const section of sections) {
        const navigationItem = page.getByTestId(`desktop-section-${section}`);
        await navigationItem.click();
        await expect(navigationItem).toHaveAttribute("aria-current", "page");
        await expect(page.locator("#painel h1")).toBeVisible();
        await expectNoWcagViolations(page, `${profile}/${section}`);
      }

      await expect(page.locator("#notification-preferences")).toHaveCount(1);
      if (profile === "operacao") {
        await expect(page.getByTestId("storage-reconciliation")).toHaveCount(1);
        await expect(page.getByTestId("storage-reconciliation")).toBeVisible();
      }
    });
  });
}

test("skip link entrega o foco ao painel principal", async ({ page }) => {
  await enterDemo(page, "cliente");
  const skipLink = page.getByRole("link", { name: "Pular para o painel" });

  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.getByTestId("main-panel")).toBeFocused();
});

test("sessão pode ser encerrada e continua revogada após recarregar", async ({ page }) => {
  await enterDemo(page, "cliente");
  await page.getByRole("button", { name: /Encerrar sessão/ }).click();
  await expect(page.getByTestId("access-screen")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("access-screen")).toBeVisible();
});

test("navegação móvel preserva o estado e a semântica da seção", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterDemo(page, "prestador");
  const account = page.getByTestId("mobile-section-conta");

  await expect(account).toBeVisible();
  await account.click();
  await expect(account).toHaveAttribute("aria-current", "page");
  await expectNoWcagViolations(page, "prestador/conta mobile");
});
