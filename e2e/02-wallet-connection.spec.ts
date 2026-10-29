import { test, expect } from "@playwright/test";
import { setupMockWallet } from "./helpers/mock-wallet";

test.describe("B. Wallet Connection", () => {
  test("shows connector options and handles user rejection safely without creating fake session", async ({
    page,
  }) => {
    await setupMockWallet(page, { rejectConnect: true });

    await page.goto("/");

    // Locate the navbar Connect Wallet button inside header
    const connectBtn = page
      .locator("header")
      .getByRole("button", { name: "Connect Wallet" });
    await expect(connectBtn).toBeVisible();

    // Click to open connector dropdown
    await connectBtn.click();

    // Connectors list should appear
    const connectorChoice = page
      .getByRole("button", { name: /MetaMask|Injected/i })
      .first();
    await expect(connectorChoice).toBeVisible();

    // Click connector - it should reject because rejectConnect is set
    await connectorChoice.click();

    // Verify rejection error is shown to user and no session is established
    await expect(page.getByText(/cancelle?d|rejected|failed/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify server session is still unauthenticated
    const sessionRes = await page.request.get("/api/auth/session");
    const sessionData = await sessionRes.json();
    expect(sessionData.authenticated).toBe(false);

    // Navbar still offers Connect Wallet
    await expect(connectBtn).toBeVisible();
  });

  test("connects wallet and transitions to wallet-only state when signature is rejected", async ({
    page,
  }) => {
    // Let wallet connection succeed, but reject the SIWE signature prompt
    await setupMockWallet(page, { rejectSign: true });

    await page.goto("/");

    // Open connector picker and click connector
    const connectBtn = page
      .locator("header")
      .getByRole("button", { name: "Connect Wallet" });
    await connectBtn.click();

    const connectorChoice = page
      .getByRole("button", { name: /MetaMask|Injected/i })
      .first();
    await connectorChoice.click();

    // After sign rejection, UI transitions to wallet-only state
    // It prompts 'Sign In with Ethereum' button
    const signInBtn = page
      .locator("header")
      .getByRole("button", { name: "Sign In with Ethereum" });
    await expect(signInBtn).toBeVisible({ timeout: 10_000 });

    // Error message indicates signature was rejected/cancelled
    await expect(page.getByText(/cancelle?d|rejected|declined/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Server session remains strictly unauthenticated
    const sessionRes = await page.request.get("/api/auth/session");
    const sessionData = await sessionRes.json();
    expect(sessionData.authenticated).toBe(false);
  });

  test("profile page provides wallet connect and displays correct status", async ({
    page,
  }) => {
    await setupMockWallet(page);

    await page.goto("/profile");

    // Profile card displays Web3 Wallet card
    await expect(page.getByRole("heading", { name: "Web3 Wallet" })).toBeVisible();
    await expect(page.getByText("Sign in with Ethereum (SIWE)")).toBeVisible();

    const cardConnectBtn = page.locator("button:has-text('Connect Wallet')").first();
    await expect(cardConnectBtn).toBeVisible();
  });
});
