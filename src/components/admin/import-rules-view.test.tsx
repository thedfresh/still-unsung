// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ImportRulesView } from "@/lib/data/guide-pages";
import { ImportRulesPage, MISSING_RULES_MESSAGE } from "./import-rules-view";

afterEach(cleanup);

const rules = (body: string, lastChange: ImportRulesView["lastChange"] = null): ImportRulesView => ({
  title: "Agent import rules",
  body,
  rev: 3,
  updatedAt: new Date("2026-11-25T12:30:00Z"),
  lastChange,
});

describe("ImportRulesPage", () => {
  it("says plainly that the page is missing", () => {
    render(<ImportRulesPage rules={null} />);
    expect(screen.getByRole("status").textContent).toBe(
      "The import rules page does not exist yet. An agent can create it through the tools; ask in a session.",
    );
    expect(MISSING_RULES_MESSAGE).toContain("does not exist yet");
  });

  it("draws headings, lists, a table, emphasis and code", () => {
    const body = "# Rules\n\n- one\n- two\n\nSome *soft* and **strong** `code`.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
    render(<ImportRulesPage rules={rules(body)} />);
    expect(screen.getByRole("heading", { name: "Rules" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("strong").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
  });

  it("shows the version, the time and a link to the last change", () => {
    render(<ImportRulesPage rules={rules("Text.", { id: 7, page: 2 })} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("2026-11-25 12:30 UTC")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Read the change" }).getAttribute("href")).toBe("/admin/changes?page=2#change-7");
  });

  it("shows raw HTML as text, never as HTML", () => {
    const { container } = render(<ImportRulesPage rules={rules("Before <script>alert(1)</script> <b>bold</b> after")} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});
