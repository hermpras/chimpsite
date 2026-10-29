import { test, expect } from "@playwright/test";
import { setupMockWallet, TEST_ACCOUNT } from "./helpers/mock-wallet";
import { shortenAddress } from "../lib/auth/address";

test.describe("E. Profile and Authenticated Flow", () => {
  test.setTimeout(90_000);

  test("profile displays authenticated wallet status, user ID, and responsive inventory section", async ({
    page,
  }) => {
    await setupMockWallet(page);

    // 1. Visit Profile and sign in directly via the Profile Card connector button
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "User Profile" })).toBeVisible({
      timeout: 20_000,
    });

    const connectBtn = page
      .getByRole("button", { name: /Connect MetaMask|Connect Injected/i })
      .first();
    await expect(connectBtn).toBeVisible({ timeout: 20_000 });
    await connectBtn.click();

    // 2. Wait for authenticated UI state
    const shortAddr = shortenAddress(TEST_ACCOUNT.address);
    await expect(page.getByText("Signed in", { exact: false }).first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(shortAddr, { exact: false }).first()).toBeVisible();

    // User ID should be rendered
    await expect(page.getByText(/user:/i)).toBeVisible();

    // 3. Whitelist status and inventory sections render cleanly without hanging loaders
    await expect(
      page.getByRole("heading", {
        name: /Community Tier & Whitelist Status/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Collection & Inventory/i }),
    ).toBeVisible();
    await expect(page.getByText(/Checking session…/i)).not.toBeVisible();

    // 4. Navigate from Profile to Whitelist page while preserving authenticated session
    const whitelistNavLink = page
      .locator("header nav")
      .getByRole("link", { name: "Whitelist", exact: true });
    await Promise.all([page.waitForURL("**/whitelist"), whitelistNavLink.click()]);

    // Header chip still displays user address
    const userChip = page
      .locator("header")
      .getByRole("button", { name: new RegExp(shortAddr, "i") });
    await expect(userChip).toBeVisible();

    // 5. Return to Profile and sign out via Profile Card
    await page.goto("/profile");
    const profileSignOutBtn = page.getByRole("button", { name: /Sign out/i }).first();
    await expect(profileSignOutBtn).toBeVisible({ timeout: 25_000 });
    await profileSignOutBtn.click();

    // 6. Verify Profile Card resets to unauthenticated state (either wallet-only or signed-out)
    await expect(page.getByText("Signed in")).not.toBeVisible();
    await expect(
      page
        .getByRole("button", {
          name: /Connect MetaMask|Connect Injected|Sign In with Ethereum/i,
        })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
