import { test, expect } from "@playwright/test";

test.describe("A. Pages and Navigation", () => {
  test("homepage renders successfully without uncaught errors", async ({ page }) => {
    const uncaughtErrors: Error[] = [];
    page.on("pageerror", (err) => uncaughtErrors.push(err));

    await page.goto("/");
    await expect(page).toHaveTitle(/ChimpHood/i);

    // Verify key sections on homepage
    await expect(
      page.getByRole("heading", { name: /Welcome to ChimpHood/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Whitelist Allocation" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Explore Whitelist/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Read Documentation/i })).toBeVisible();

    expect(uncaughtErrors).toHaveLength(0);
  });

  test("main navigation links navigate correctly between pages", async ({ page }) => {
    const uncaughtErrors: Error[] = [];
    page.on("pageerror", (err) => uncaughtErrors.push(err));

    await page.goto("/");

    // Navigate to Whitelist via navbar link
    const whitelistNavLink = page
      .locator("header nav")
      .getByRole("link", { name: "Whitelist", exact: true });
    await Promise.all([page.waitForURL("**/whitelist"), whitelistNavLink.click()]);
    await expect(page.getByRole("heading", { name: /Whitelist Portal/i })).toBeVisible();

    // Navigate to Documentation via navbar link
    const docsNavLink = page
      .locator("header nav")
      .getByRole("link", { name: "Docs", exact: true });
    await Promise.all([page.waitForURL("**/docs"), docsNavLink.click()]);
    await expect(
      page.getByRole("heading", { name: /ChimpHood Documentation/i }),
    ).toBeVisible();

    // Navigate to Profile via navbar link
    const profileNavLink = page
      .locator("header nav")
      .getByRole("link", { name: "Profile", exact: true });
    await Promise.all([page.waitForURL("**/profile"), profileNavLink.click()]);
    await expect(page.getByRole("heading", { name: /User Profile/i })).toBeVisible();

    // Return to Home by clicking the ChimpHood logo
    const homeLogo = page
      .locator("header")
      .getByRole("link", { name: /CHIMPHOOD/i })
      .first();
    await Promise.all([page.waitForURL("http://localhost:3000/"), homeLogo.click()]);
    await expect(
      page.getByRole("heading", { name: /Welcome to ChimpHood/i }),
    ).toBeVisible();

    expect(uncaughtErrors).toHaveLength(0);
  });
});
