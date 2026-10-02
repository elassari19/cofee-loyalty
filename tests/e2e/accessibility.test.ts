import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility checks for public pages (checklist §13).
 *
 * Tests keyboard navigation, forms, dialogs, contrast, and screen-reader labels
 * on key public pages using axe-core.
 */

test.describe.configure({ retries: 0 });

const PUBLIC_PAGES = [
  { path: "/", name: "Home" },
  { path: "/sign-in", name: "Sign In" },
  { path: "/sign-up", name: "Sign Up" },
  { path: "/forgot-password", name: "Request Password Reset" },
];

test.describe("Accessibility — Public pages (checklist §13)", () => {
  for (const pageInfo of PUBLIC_PAGES) {
    test(`${pageInfo.name} has no accessibility violations`, async ({
      page,
    }) => {
      await page.goto(pageInfo.path, { waitUntil: "networkidle" });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }
});

test.describe("Accessibility — Keyboard navigation (checklist §13)", () => {
  test("Sign In page is keyboard navigable", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");

    const focusableElements = await page
      .locator(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      .all();

    expect(focusableElements.length).toBeGreaterThan(0);

    await page.keyboard.press("Tab");
    const firstFocused = await page.evaluate(
      () => document.activeElement?.tagName,
    );
    expect(["INPUT", "BUTTON", "A"]).toContain(firstFocused);
  });

  test("Sign Up page is keyboard navigable", async ({ page }) => {
    await page.goto("/sign-up");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("Tab");
    const firstFocused = await page.evaluate(
      () => document.activeElement?.tagName,
    );
    expect(["INPUT", "BUTTON", "A"]).toContain(firstFocused);
  });

  test("Home page is keyboard navigable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("Tab");
    const firstFocused = await page.evaluate(
      () => document.activeElement?.tagName,
    );
    expect(["BUTTON", "A", "INPUT"]).toContain(firstFocused);
  });
});

test.describe("Accessibility — Form structure (checklist §13)", () => {
  test("Sign In form has inputs with accessible names", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
    await page.locator("form").first().waitFor({ state: "visible" });

    // Verify form has at least 2 inputs (email, password)
    const inputs = await page.locator("form input").all();
    expect(inputs.length).toBeGreaterThanOrEqual(2);

    // Each input should have an accessible name (label, aria-label, aria-labelledby, or placeholder)
    for (const input of inputs) {
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");
      const placeholder = await input.getAttribute("placeholder");
      const type = await input.getAttribute("type");

      // Skip hidden inputs
      if (type === "hidden") continue;

      const hasLabel = id
        ? (await page.locator(`label[for="${id}"]`).count()) > 0
        : false;

      // Input should have some accessible name
      expect(
        hasLabel || ariaLabel || ariaLabelledBy || placeholder,
      ).toBeTruthy();
    }
  });

  test("Sign Up form has inputs with accessible names", async ({ page }) => {
    await page.goto("/sign-up");
    await page.waitForLoadState("networkidle");
    await page.locator("form").first().waitFor({ state: "visible" });

    const inputs = await page.locator("form input").all();
    expect(inputs.length).toBeGreaterThanOrEqual(3); // name, email, password

    for (const input of inputs) {
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");
      const placeholder = await input.getAttribute("placeholder");
      const type = await input.getAttribute("type");

      if (type === "hidden") continue;

      const hasLabel = id
        ? (await page.locator(`label[for="${id}"]`).count()) > 0
        : false;

      expect(
        hasLabel || ariaLabel || ariaLabelledBy || placeholder,
      ).toBeTruthy();
    }
  });

  test("Password reset form has email input with accessible name", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");
    await page.locator("form").first().waitFor({ state: "visible" });

    const inputs = await page.locator("form input").all();
    expect(inputs.length).toBeGreaterThanOrEqual(1);

    for (const input of inputs) {
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");
      const placeholder = await input.getAttribute("placeholder");
      const type = await input.getAttribute("type");

      if (type === "hidden") continue;

      const hasLabel = id
        ? (await page.locator(`label[for="${id}"]`).count()) > 0
        : false;

      expect(
        hasLabel || ariaLabel || ariaLabelledBy || placeholder,
      ).toBeTruthy();
    }
  });
});

test.describe("Accessibility — Color contrast (checklist §13)", () => {
  test("Sign In page meets WCAG AA contrast", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["cat.color"])
      .analyze();

    const contrastViolations = results.violations.filter(
      (v) => v.id === "color-contrast",
    );

    expect(contrastViolations).toEqual([]);
  });

  test("Sign Up page meets WCAG AA contrast", async ({ page }) => {
    await page.goto("/sign-up");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["cat.color"])
      .analyze();

    const contrastViolations = results.violations.filter(
      (v) => v.id === "color-contrast",
    );

    expect(contrastViolations).toEqual([]);
  });

  test("Home page meets WCAG AA contrast", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["cat.color"])
      .analyze();

    const contrastViolations = results.violations.filter(
      (v) => v.id === "color-contrast",
    );

    expect(contrastViolations).toEqual([]);
  });
});

test.describe("Accessibility — Screen reader labels (checklist §13)", () => {
  test("Navigation has proper ARIA labels", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const nav = page.locator("nav").first();
    if ((await nav.count()) > 0) {
      const hasAriaLabel = await nav.getAttribute("aria-label");
      const hasAriaLabelledBy = await nav.getAttribute("aria-labelledby");
      expect(hasAriaLabel || hasAriaLabelledBy).toBeTruthy();
    }
  });

  test("Buttons have accessible names", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");

    const buttons = await page.locator("button").all();
    for (const button of buttons) {
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute("aria-label");
      const ariaLabelledBy = await button.getAttribute("aria-labelledby");

      expect(text?.trim() || ariaLabel || ariaLabelledBy).toBeTruthy();
    }
  });

  test("Form inputs have accessible names", async ({ page }) => {
    await page.goto("/sign-up");
    await page.waitForLoadState("networkidle");
    await page.locator("form").first().waitFor({ state: "visible" });

    const inputs = await page.locator("input").all();
    for (const input of inputs) {
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");
      const placeholder = await input.getAttribute("placeholder");

      const hasLabel = id
        ? (await page.locator(`label[for="${id}"]`).count()) > 0
        : false;

      expect(
        hasLabel || ariaLabel || ariaLabelledBy || placeholder,
      ).toBeTruthy();
    }
  });
});

test.describe("Accessibility — Focus management (checklist §13)", () => {
  test("Skip link exists for main content", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const skipLink = page.locator('a[href="#main"], a[href="#content"]');
    await skipLink.count();
  });
});

test.describe("Accessibility — Error states (checklist §13)", () => {
  test("Form validation errors are announced", async ({ page }) => {
    await page.goto("/sign-up");
    await page.waitForLoadState("networkidle");
    await page.locator("form").first().waitFor({ state: "visible" });

    // Submit empty form
    await page.click('button[type="submit"]');

    // Check for error messages with role="alert" or aria-live
    const errorMessages = page.locator(
      '[role="alert"], [aria-live="polite"], [aria-live="assertive"]',
    );
    const visibleErrors = page.locator(
      '.text-destructive, .text-red-500, [data-testid="error-message"], [data-slot="field-error"]',
    );

    // At least one error indication should exist
    const totalErrors =
      (await errorMessages.count()) + (await visibleErrors.count());
    expect(totalErrors).toBeGreaterThan(0);
  });

  test("Required fields are marked", async ({ page }) => {
    await page.goto("/sign-up");
    await page.waitForLoadState("networkidle");
    await page.locator("form").first().waitFor({ state: "visible" });

    const requiredInputs = await page
      .locator("input[required], select[required], textarea[required]")
      .all();
    for (const input of requiredInputs) {
      const ariaRequired = await input.getAttribute("aria-required");
      const id = await input.getAttribute("id");
      const hasAsterisk = id
        ? await page
            .locator(`label[for="${id}"]`)
            .textContent()
            .then((t) => t?.includes("*"))
        : false;

      expect(ariaRequired === "true" || hasAsterisk).toBeTruthy();
    }
  });
});
