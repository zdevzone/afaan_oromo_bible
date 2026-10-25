import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import fixture from "../../../content/fixtures/sample.json";
import { en } from "../../locales/en";
import { AboutDialog } from "./AboutDialog";

afterEach(cleanup);

describe("offline About information", () => {
  it("shows the installed content identity and reads the bundled notice", async () => {
    render(
      <AboutDialog
        open
        onOpenChange={() => {}}
        edition={{
          ...fixture.edition,
          sourceTitle: "Synthetic source bundle",
          rightsHolderName: "Project test authors",
          languageName: "Synthetic language",
          sourceCompletedOn: "2024-01-01",
          sourceArchiveSha256: "a".repeat(64),
        }}
        books={fixture.books}
        strings={en}
      />,
    );
    expect(screen.getByText(fixture.edition.title, { exact: false })).toBeTruthy();
    expect(
      screen.getByText("Synthetic development content — not Scripture.", { exact: false }),
    ).toBeTruthy();
    expect(screen.getByText("Sample Book A").closest("li")?.textContent).toBe(
      "Sample Book A (TSA)",
    );
    expect(screen.getByText("Synthetic source bundle")).toBeTruthy();
    expect(screen.getByText("Project test authors")).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Read shadcn/ui MIT notice" }));
    expect(screen.getByText("MIT License", { exact: false })).toBeTruthy();
  });
});
