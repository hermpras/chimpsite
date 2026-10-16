import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import HomePage from "@/app/page";
import DocsPage from "@/app/docs/page";
import WhitelistPage from "@/app/whitelist/page";
import ProfilePage from "@/app/profile/page";
import { Providers } from "@/components/providers";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
  }),
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

  it("renders WhitelistPage with English portal headings and campaigns", () => {
    const { container } = render(<WhitelistPage />);
    expect(screen.getByText("Whitelist Portal")).toBeInTheDocument();
    expect(screen.getByText("Check Whitelist Allocation Status")).toBeInTheDocument();
    expect(screen.getByText("Campaigns & Quests")).toBeInTheDocument();
    expect(screen.getByText("Gifts & Referral Allocation")).toBeInTheDocument();
    expect(screen.getByText("Check Eligibility (Placeholder)")).toBeInTheDocument();

    for (const pattern of INDONESIAN_UI_WORDS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("renders ProfilePage with live SIWE wallet card and remaining placeholders", () => {
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
    expect(screen.getByText("X OAuth Not Active Yet")).toBeInTheDocument();
    expect(screen.getByText("Community Tier & Whitelist Status")).toBeInTheDocument();
    expect(screen.getByText("Collection & Inventory")).toBeInTheDocument();
    expect(screen.getByText("Inventory Empty")).toBeInTheDocument();
    // The Stage 1 wallet placeholder is gone.
    expect(screen.queryByText(/Connect Wallet \(Placeholder\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0x000\.\.\.0000/i)).not.toBeInTheDocument();

    for (const pattern of INDONESIAN_UI_WORDS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });
});
