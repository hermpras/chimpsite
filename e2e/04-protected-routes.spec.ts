import { test, expect } from "@playwright/test";
import { setupMockWallet } from "./helpers/mock-wallet";

test.describe("D. Protected Routes and Server Authority", () => {
  test("unauthenticated visitor accessing /admin directly receives Access Denied", async ({
    page,
  }) => {
    // Navigate directly to /admin without any session
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    // Must render AdminAccessDenied component
    await expect(
      page
        .getByText(
          /Access Denied|Authentication Required|Admin Portal Access Restricted/i,
        )
        .first(),
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("link", { name: /Back to Home/i })).toBeVisible();

    // Admin dashboard elements must NOT be visible
    await expect(page.getByText("Super Admin Dashboard")).not.toBeVisible();
    await expect(page.getByText("Audit Log Telemetry")).not.toBeVisible();
  });

  test("protected administrative APIs strictly reject unauthenticated requests with 401", async ({
    page,
  }) => {
    // 1. Audit logs API
    const auditRes = await page.request.get("/api/admin/audit-logs");
    expect([401, 403]).toContain(auditRes.status());

    // 2. Abuse flags API
    const flagsRes = await page.request.get("/api/admin/abuse-flags");
    expect([401, 403]).toContain(flagsRes.status());

    // 3. Admin whitelist API
    const wlAdminRes = await page.request.get("/api/admin/whitelist/slots");
    expect([401, 403]).toContain(wlAdminRes.status());

    // 4. Admin drops API
    const dropsAdminRes = await page.request.get("/api/admin/drops");
    expect([401, 403]).toContain(dropsAdminRes.status());
  });

  test("authenticated regular user is denied admin access by server authorization", async ({
    page,
  }) => {
    await setupMockWallet(page);

    // 1. Log in via SIWE on homepage
    await page.goto("/");
    const connectBtn = page
      .locator("header")
      .getByRole("button", { name: "Connect Wallet" });
    await connectBtn.click();
    const connectorChoice = page
      .getByRole("button", { name: /MetaMask|Injected/i })
      .first();
    await connectorChoice.click();

    // Wait until authenticated
    await expect(
      page.locator("header").getByRole("button", { name: /0xf39/i }),
    ).toBeVisible({
      timeout: 15_000,
    });

    // 2. Direct navigation to /admin with regular user session
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    // Must still be denied access because regular user is not SUPER_ADMIN
    await expect(
      page.getByText(/Access Denied|Forbidden|Admin Portal Access Restricted/i).first(),
    ).toBeVisible({ timeout: 25_000 });

    // API check also confirms 403 Forbidden for regular user
    const auditRes = await page.request.get("/api/admin/audit-logs");
    expect(auditRes.status()).toBe(403);
  });
});
