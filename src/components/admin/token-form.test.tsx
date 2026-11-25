// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenForm, type CreateTokenState } from "./token-form";

afterEach(cleanup);

const agents = [{ id: "u1", email: "agent@example.test" }];

describe("TokenForm", () => {
  it("tells the admin to add an agent user first when there is none", () => {
    render(<TokenForm action={vi.fn()} agents={[]} />);
    expect(screen.getByText(/Add a user with the AGENT role first/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Make token" })).toBeNull();
  });

  it("shows the new token once, with a copy warning", async () => {
    const action = vi.fn(async (): Promise<CreateTokenState> => ({ token: "suat_example" }));
    render(<TokenForm action={action} agents={agents} />);
    await userEvent.type(screen.getByLabelText("Label"), "MCP server");
    await userEvent.click(screen.getByRole("button", { name: "Make token" }));
    expect((await screen.findByTestId("new-token")).textContent).toBe("suat_example");
    expect(screen.getByRole("status").textContent).toContain("shown once");
    const form = (action.mock.calls[0] as unknown as [CreateTokenState, FormData])[1];
    expect(form.get("userId")).toBe("u1");
    expect(form.get("label")).toBe("MCP server");
  });

  it("shows an error in text and no token when the action refuses", async () => {
    const action = vi.fn(async (): Promise<CreateTokenState> => ({ error: "Enter a label." }));
    render(<TokenForm action={action} agents={agents} />);
    await userEvent.type(screen.getByLabelText("Label"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Make token" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a label.");
    expect(screen.queryByTestId("new-token")).toBeNull();
  });
});
