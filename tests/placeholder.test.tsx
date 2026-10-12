import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

describe("UI Foundation Components", () => {
  it("renders PlaceholderNotice with correct title and phase", () => {
    render(
      <PlaceholderNotice
        title="Test Feature"
        description="This feature is a placeholder"
        phase="Tahap 0"
      />,
    );

    expect(screen.getByText("Test Feature")).toBeInTheDocument();
    expect(screen.getByText("This feature is a placeholder")).toBeInTheDocument();
    expect(screen.getByText("Tahap 0")).toBeInTheDocument();
  });

  it("renders Badge with default variant", () => {
    render(<Badge>Active Status</Badge>);
    expect(screen.getByText("Active Status")).toBeInTheDocument();
  });

  it("renders Button and handles disabled state", () => {
    render(<Button disabled>Disabled Action</Button>);
    const button = screen.getByRole("button", { name: "Disabled Action" });
    expect(button).toBeDisabled();
  });
});
