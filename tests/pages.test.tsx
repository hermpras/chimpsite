import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import HomePage from "@/app/page";
import DocsPage from "@/app/docs/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("Framework Pages Rendering", () => {
  it("renders HomePage successfully with key headings", () => {
    render(<HomePage />);
    expect(screen.getByText("Welcome to")).toBeInTheDocument();
    expect(screen.getByText("ChimpHood")).toBeInTheDocument();
    expect(screen.getByText("Whitelist Allocation")).toBeInTheDocument();
  });

  it("renders DocsPage with architecture information", () => {
    render(<DocsPage />);
    expect(screen.getByText("ChimpHood Documentation")).toBeInTheDocument();
    expect(screen.getByText("Arsitektur & Tech Stack")).toBeInTheDocument();
  });
});
