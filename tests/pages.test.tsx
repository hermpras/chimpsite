import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import HomePage from "@/app/page";
import DocsPage from "@/app/docs/page";
import DropsPage from "@/app/drops/page";
import WhitelistPage from "@/app/whitelist/page";
import ProfilePage from "@/app/profile/page";
import { Navbar } from "@/components/layout/Navbar";
import { Providers } from "@/components/providers";

// Mock next/navigation
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

const INDONESIAN_UI_WORDS = [
  /\bTahap\b/i,
  /\bHalaman\b/i,
  /\bBelum Terhubung\b/i,
  /\bKerangka\b/i,
  /\bMendatang\b/i,
  /\bKlaim\b/i,
  /\bHadiah\b/i,
  /\bBuka Whitelist\b/i,
  /\bBaca Dokumentasi\b/i,
  /\bDokumentasi Proyek\b/i,
  /\bCek Kelayakan\b/i,
  /\bHubungkan\b/i,
];

describe("Public Pages English Copy Rendering", () => {
  it("renders HomePage successfully with key English headings and terminology", () => {
    const { container } = render(<HomePage />);
    expect(screen.getByText("Welcome to")).toBeInTheDocument();
    expect(screen.getByText("ChimpHood")).toBeInTheDocument();
    expect(screen.getByText("Whitelist Allocation")).toBeInTheDocument();
    expect(screen.getByText("Explore Whitelist")).toBeInTheDocument();
    expect(screen.getByText("Read Documentation")).toBeInTheDocument();
    expect(screen.getByText("Current Implementation Status")).toBeInTheDocument();

    for (const pattern of INDONESIAN_UI_WORDS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("renders DocsPage with English architecture information and roadmap", () => {
    const { container } = render(<DocsPage />);
    expect(screen.getByText("ChimpHood Documentation")).toBeInTheDocument();
    expect(screen.getByText("Architecture & Tech Stack")).toBeInTheDocument();
    expect(screen.getByText("Project Documentation")).toBeInTheDocument();
    expect(screen.getByText("Development Roadmap")).toBeInTheDocument();

    for (const pattern of INDONESIAN_UI_WORDS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("renders DropsPage successfully with key English headings and terminology", () => {
    const { container } = render(
      <Providers>
        <DropsPage />
      </Providers>,
    );
    expect(screen.getByText("Trait Drops & Lootbox Engine")).toBeInTheDocument();
    expect(screen.getByText("Periodic Drop Cycle")).toBeInTheDocument();
    expect(screen.getByText("Stage 1 Live")).toBeInTheDocument();
    expect(screen.getByText("Whitelist Status")).toBeInTheDocument();
    expect(screen.getByText("My Inventory")).toBeInTheDocument();

    for (const pattern of INDONESIAN_UI_WORDS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("renders Navbar with navigation links including Drops on both desktop and mobile drawer", () => {
    render(
      <Providers>
        <Navbar />
      </Providers>,
    );
    expect(screen.getAllByRole("link", { name: "Home" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Drops" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Whitelist" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Profile" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Docs" }).length).toBeGreaterThanOrEqual(1);

    // Open mobile menu
    const mobileTrigger = screen.getByRole("button", { name: /toggle navigation menu/i });
    fireEvent.click(mobileTrigger);

    // Verify links rendered in mobile menu drawer (desktop + mobile now have 2 links each)
    const dropsLinks = screen.getAllByRole("link", { name: "Drops" });
    expect(dropsLinks.length).toBe(2);
    expect(dropsLinks[1]).toHaveAttribute("href", "/drops");

    // Clicking mobile link closes drawer
    fireEvent.click(dropsLinks[1]);
    expect(screen.getAllByRole("link", { name: "Drops" }).length).toBe(1);
  });

  it("renders WhitelistPage with English portal headings and campaigns", () => {
    const { container } = render(
      <Providers>
        <WhitelistPage />
      </Providers>,
    );
    expect(screen.getByText("Whitelist Portal")).toBeInTheDocument();
    expect(screen.getByText("Whitelist Status & Allocation")).toBeInTheDocument();
    expect(screen.getByText("Campaigns & Quests")).toBeInTheDocument();
    expect(screen.getByText("Trait Lootbox Drops")).toBeInTheDocument();
    expect(screen.getByText("Go to Drops")).toBeInTheDocument();
    expect(screen.queryByText("Gifts & Referral Allocation")).not.toBeInTheDocument();
    expect(screen.queryByText("Check Eligibility")).not.toBeInTheDocument();

    for (const pattern of INDONESIAN_UI_WORDS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("renders ProfilePage with live SIWE wallet card and updated X linking UI", () => {
    mockSearchParams = new URLSearchParams();
    // The wallet card uses wagmi hooks, so it needs the real providers.
    const { container } = render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );
    expect(screen.getByText("User Profile")).toBeInTheDocument();
    expect(screen.getByText("Web3 Wallet")).toBeInTheDocument();
    expect(screen.getByText("Sign in with Ethereum (SIWE)")).toBeInTheDocument();
    expect(screen.getByText("X (Twitter) Identity")).toBeInTheDocument();
    expect(screen.getByText("Community Tier & Whitelist Status")).toBeInTheDocument();
    expect(screen.getByText("Collection & Inventory")).toBeInTheDocument();
    expect(screen.getByText("Inventory Empty")).toBeInTheDocument();

    // Verify removed placeholders
    expect(screen.queryByText("X OAuth Not Active Yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/Link X Account \(Placeholder\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/@username \(Placeholder\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Connect Wallet \(Placeholder\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0x000\.\.\.0000/i)).not.toBeInTheDocument();

    // Verify active link button
    expect(screen.getByRole("button", { name: "Link X Account" })).toBeInTheDocument();

    for (const pattern of INDONESIAN_UI_WORDS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("renders ProfilePage with success feedback banner when x_linked=1 is in query parameters", () => {
    mockSearchParams = new URLSearchParams("x_linked=1");
    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );
    expect(screen.getByText("X Account Successfully Linked")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your X (Twitter) profile has been verified and connected to your account.",
      ),
    ).toBeInTheDocument();
  });

  it("renders ProfilePage with failure feedback banner when x_error is in query parameters", () => {
    mockSearchParams = new URLSearchParams("x_error=access_denied");
    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );
    expect(screen.getByText("X Authentication Failed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Authorization was denied by user. Please try connecting your X account again.",
      ),
    ).toBeInTheDocument();
  });
});
