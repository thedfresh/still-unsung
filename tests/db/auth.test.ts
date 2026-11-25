import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClosedAdapter } from "@/lib/data/auth-adapter";
import { createAgentToken, listAgentTokens, revokeAgentToken } from "@/lib/data/agent-tokens";
import { addUser, listUsers, removeUser } from "@/lib/data/users";
import { getPrisma } from "@/lib/db";
import { RateLimiter } from "@/lib/rate-limit";
import { resolveUser } from "@/lib/resolve-user";
import { hashToken } from "@/lib/tokens";
import { resetDatabase } from "../support/reset-database";

const db = getPrisma();
const noSession = { sessionUserId: null, clientKey: "test-client" } as const;

async function makeAdmin(email = "admin@example.test") {
  return addUser({ email, role: "ADMIN" });
}
async function makeAgent(email = "agent@example.test") {
  return addUser({ email, role: "AGENT" });
}

beforeEach(async () => {
  await resetDatabase(db);
});
afterAll(async () => {
  await db.$disconnect();
});

describe("closed sign-up", () => {
  it("refuses to create a user and writes no row", async () => {
    const adapter = createClosedAdapter();
    await expect(
      adapter.createUser!({ id: "x", email: "stranger@example.test", emailVerified: null }),
    ).rejects.toThrow(/closed/);
    expect(await db.user.count()).toBe(0);
  });

  it("finds an existing user by email, in any letter case, and no one else", async () => {
    await makeAdmin("Curator@Example.test");
    const adapter = createClosedAdapter();
    expect((await adapter.getUserByEmail!("CURATOR@example.TEST"))?.email).toBe("curator@example.test");
    expect(await adapter.getUserByEmail!("stranger@example.test")).toBeNull();
  });
});

describe("user list", () => {
  it("adds a user and refuses a second user with the same email", async () => {
    await makeAdmin();
    await expect(addUser({ email: "ADMIN@example.test", role: "AGENT" })).rejects.toMatchObject({ code: "conflict" });
    expect(await listUsers()).toHaveLength(1);
  });

  it("removes a user, with the tokens that belong to them", async () => {
    await makeAdmin();
    const agent = await makeAgent();
    await createAgentToken(agent.id, "test");
    await removeUser(agent.id);
    expect(await db.user.count()).toBe(1);
    expect(await db.agentToken.count()).toBe(0);
  });

  it("refuses to remove the last admin", async () => {
    const admin = await makeAdmin();
    await expect(removeUser(admin.id)).rejects.toMatchObject({ code: "conflict" });
    await makeAdmin("second@example.test");
    await removeUser(admin.id);
    expect(await db.user.count()).toBe(1);
  });

  it("refuses to remove a user who recorded changes", async () => {
    await makeAdmin();
    const agent = await makeAgent();
    await db.changeset.create({ data: { userId: agent.id, path: "MCP", summary: "Test", ownKnowledge: true } });
    await expect(removeUser(agent.id)).rejects.toMatchObject({ code: "conflict" });
    expect(await db.user.count()).toBe(2);
  });
});

describe("the signed-in user", () => {
  it("is nobody without a session or a token", async () => {
    expect(await resolveUser({ ...noSession, authorization: null })).toBeNull();
  });

  it("is the session user, with the role read from the database", async () => {
    const admin = await makeAdmin();
    const user = await resolveUser({ authorization: null, sessionUserId: admin.id, clientKey: "c" });
    expect(user).toMatchObject({ id: admin.id, role: "ADMIN", via: "session" });
    await db.user.update({ where: { id: admin.id }, data: { role: "AGENT" } });
    expect(await resolveUser({ authorization: null, sessionUserId: admin.id, clientKey: "c" })).toMatchObject({
      role: "AGENT",
    });
  });

  it("is nobody when the session user was removed", async () => {
    expect(await resolveUser({ authorization: null, sessionUserId: "gone", clientKey: "c" })).toBeNull();
  });
});

describe("agent access tokens", () => {
  it("acts as the agent user and never as an admin", async () => {
    const agent = await makeAgent();
    const { token } = await createAgentToken(agent.id, "MCP server");
    const user = await resolveUser({ ...noSession, authorization: `Bearer ${token}` });
    expect(user).toMatchObject({ id: agent.id, role: "AGENT", via: "token" });
  });

  it("stores only the hash", async () => {
    const agent = await makeAgent();
    const { token } = await createAgentToken(agent.id, "MCP server");
    const rows = await db.$queryRaw<Record<string, unknown>[]>`SELECT * FROM agent_tokens`;
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(await listAgentTokens())).not.toContain(token);
  });

  it("refuses a token for a user without the AGENT role", async () => {
    const admin = await makeAdmin();
    await expect(createAgentToken(admin.id, "bad")).rejects.toMatchObject({ code: "forbidden" });
    expect(await db.agentToken.count()).toBe(0);
  });

  it("refuses a token whose user is no longer an agent", async () => {
    const agent = await makeAgent();
    const { token } = await createAgentToken(agent.id, "x");
    await db.user.update({ where: { id: agent.id }, data: { role: "ADMIN" } });
    expect(await resolveUser({ ...noSession, authorization: `Bearer ${token}` })).toBeNull();
  });

  it("refuses a revoked token at once", async () => {
    const agent = await makeAgent();
    const { id, token } = await createAgentToken(agent.id, "x");
    expect(await resolveUser({ ...noSession, authorization: `Bearer ${token}` })).not.toBeNull();
    await revokeAgentToken(id);
    expect(await resolveUser({ ...noSession, authorization: `Bearer ${token}` })).toBeNull();
    await revokeAgentToken(id); // twice is harmless
  });

  it("refuses a wrong token, and a wrong token never falls back to the session", async () => {
    const admin = await makeAdmin();
    const agent = await makeAgent();
    await createAgentToken(agent.id, "x");
    expect(await resolveUser({ ...noSession, authorization: "Bearer suat_wrong" })).toBeNull();
    expect(await resolveUser({ authorization: "Bearer suat_wrong", sessionUserId: admin.id, clientKey: "c" })).toBeNull();
    expect(await resolveUser({ ...noSession, authorization: "Basic abc" })).toBeNull();
    expect(await resolveUser({ authorization: "Bearer", sessionUserId: admin.id, clientKey: "c" })).toBeNull();
  });

  it("ignores a non-Bearer header, such as a proxy's Basic Auth, and reads the session", async () => {
    const admin = await makeAdmin();
    const user = await resolveUser({ authorization: "Basic YXJjaGl2ZTpzZWNyZXQ=", sessionUserId: admin.id, clientKey: "c" });
    expect(user).toMatchObject({ id: admin.id, role: "ADMIN", via: "session" });
  });

  it("limits wrong tokens for each client, then refuses even a valid one", async () => {
    const agent = await makeAgent();
    const { token } = await createAgentToken(agent.id, "x");
    const limiter = new RateLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) {
      expect(await resolveUser({ ...noSession, authorization: "Bearer wrong" }, limiter)).toBeNull();
    }
    await expect(resolveUser({ ...noSession, authorization: `Bearer ${token}` }, limiter)).rejects.toMatchObject({
      code: "rate_limited",
    });
    // Another client is not affected.
    const other = { sessionUserId: null, clientKey: "other-client", authorization: `Bearer ${token}` };
    expect(await resolveUser(other, limiter)).toMatchObject({ role: "AGENT" });
  });

  it("notes when the token was last used", async () => {
    const agent = await makeAgent();
    const { token } = await createAgentToken(agent.id, "x");
    await resolveUser({ ...noSession, authorization: `Bearer ${token}` });
    expect((await listAgentTokens())[0].lastUsedAt).toBeInstanceOf(Date);
  });
});
