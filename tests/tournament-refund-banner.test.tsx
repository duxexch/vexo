import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TournamentRefundBanner } from "../client/src/pages/tournaments";

describe("TournamentRefundBanner — deleted tournament copy", () => {
  it("renders the English deletion-specific headline + reason + amount (USD, list variant)", () => {
    render(
      <TournamentRefundBanner
        refund={{ amount: "12.50", currency: "usd", reason: "deleted" }}
        variant="list"
        en={true}
        testId="refund-banner-en-list"
      />,
    );

    const banner = screen.getByTestId("refund-banner-en-list");
    expect(banner.textContent).toContain("Refunded");
    expect(banner.textContent).toContain("12.50");
    expect(banner.textContent).toContain("cash balance");
    expect(banner.textContent).toContain("tournament was deleted");
    expect(banner.textContent).not.toContain("tournament was cancelled");
  });

  it("renders the Arabic deletion-specific headline + reason + amount (USD, detail variant)", () => {
    render(
      <TournamentRefundBanner
        refund={{ amount: "8.00", currency: "usd", reason: "deleted" }}
        variant="detail"
        en={false}
        testId="refund-banner-ar-detail"
      />,
    );

    const banner = screen.getByTestId("refund-banner-ar-detail");
    expect(banner.textContent).toContain("تم استرداد");
    expect(banner.textContent).toContain("8.00");
    expect(banner.textContent).toContain("رصيدك النقدي");
    expect(banner.textContent).toContain("تم حذف البطولة");
    expect(banner.textContent).not.toContain("تم إلغاء البطولة");
  });

  it("uses the project-wallet wording when refund is in the project currency (EN)", () => {
    render(
      <TournamentRefundBanner
        refund={{ amount: "100.00", currency: "project", reason: "deleted" }}
        variant="detail"
        en={true}
        testId="refund-banner-en-project"
      />,
    );

    const banner = screen.getByTestId("refund-banner-en-project");
    expect(banner.textContent).toContain("project wallet");
    expect(banner.textContent).not.toContain("cash balance");
    expect(banner.textContent).toContain("tournament was deleted");
  });

  it("uses the project-wallet wording when refund is in the project currency (AR)", () => {
    render(
      <TournamentRefundBanner
        refund={{ amount: "250.00", currency: "project", reason: "deleted" }}
        variant="list"
        en={false}
        testId="refund-banner-ar-project"
      />,
    );

    const banner = screen.getByTestId("refund-banner-ar-project");
    expect(banner.textContent).toContain("محفظتك");
    expect(banner.textContent).not.toContain("رصيدك النقدي");
    expect(banner.textContent).toContain("تم حذف البطولة");
  });

  it("does NOT use the deletion copy when reason is 'cancelled' (regression guard)", () => {
    render(
      <TournamentRefundBanner
        refund={{ amount: "5.00", currency: "usd", reason: "cancelled" }}
        variant="list"
        en={true}
        testId="refund-banner-cancelled"
      />,
    );

    const banner = screen.getByTestId("refund-banner-cancelled");
    expect(banner.textContent).toContain("tournament was cancelled");
    expect(banner.textContent).not.toContain("tournament was deleted");
  });
});
