import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { saveAdminChanges } from "@/lib/data/changes/admin-save";
import { getListRows } from "@/lib/data/lists";
import { addUser } from "@/lib/data/users";
import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { CurrentUser, Role } from "@/lib/roles";
import { listConfigBySlug } from "@/lib/lists/config";
import { createEdit, deleteEdit, moveEdits, updateEdit } from "@/lib/lists/edits";
import { resetDatabase } from "../support/reset-database";

const db = getPrisma();
const config = listConfigBySlug("set-types")!;
const own = { ownKnowledge: true };
let admin: CurrentUser;

const asAdmin = async (roles: readonly Role[]) => {
  if (!roles.includes(admin.role)) throw new AppError("forbidden");
  return admin;
};
const save = (edits: object[]) => saveAdminChanges({ edits, evidence: own }, asAdmin);
const rows = () => getListRows(config);
const draft = (name: string) => ({ name, displayName: name.toUpperCase(), includeInStats: true });

beforeEach(async () => {
  await resetDatabase(db);
  const row = await addUser({ email: "admin@example.test", role: "ADMIN" });
  admin = { id: row.id, email: "admin@example.test", name: null, role: "ADMIN", via: "session", };
  for (const [index, name] of ["First", "Second", "Third"].entries()) {
    await db.setType.create({ data: { name, displayName: name, position: index + 1 } });
  }
});
afterAll(async () => {
  await db.$disconnect();
});

describe("editable lists", () => {
  it("adds a value at the end as one admin changeset", async () => {
    const before = await rows();
    const result = await save([createEdit(config, draft("Fourth"), before.length + 1)]);
    expect(result.status).toBe("saved");
    const after = await rows();
    expect(after.map((r) => r.values.name)).toEqual(["First", "Second", "Third", "Fourth"]);
    expect(after[3].values).toMatchObject({ displayName: "FOURTH", includeInStats: true });
    const sets = await db.changeset.findMany({ include: { items: true } });
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ path: "ADMIN", status: "APPLIED", userId: admin.id, ownKnowledge: true });
    expect(sets[0].items).toMatchObject([{ tableName: "set_types", action: "CREATE" }]);
  });

  it("renames a value and raises its version", async () => {
    const [first] = await rows();
    const edit = updateEdit(config, first, { ...first.values, name: "Opening set" });
    expect(edit).not.toBeNull();
    expect((await save([edit!])).status).toBe("saved");
    const [after] = await rows();
    expect(after).toMatchObject({ id: first.id, rev: first.rev + 1 });
    expect(after.values.name).toBe("Opening set");
    const sets = await db.changeset.findMany({ include: { items: true } });
    expect(sets).toHaveLength(1);
    expect(sets[0].items[0]).toMatchObject({ action: "UPDATE", before: { name: "First" }, after: { name: "Opening set" } });
  });

  it("makes no edit when nothing changed", async () => {
    const [first] = await rows();
    expect(updateEdit(config, first, first.values)).toBeNull();
  });

  it("moves a value down and up, in one changeset each, writing position", async () => {
    const start = await rows();
    expect((await save(moveEdits(config, start, start[0].id, 1))).status).toBe("saved");
    expect((await rows()).map((r) => r.values.name)).toEqual(["Second", "First", "Third"]);
    const middle = await rows();
    expect((await save(moveEdits(config, middle, middle[2].id, -1))).status).toBe("saved");
    expect((await rows()).map((r) => r.values.name)).toEqual(["Second", "Third", "First"]);
    expect((await rows()).map((r) => r.position)).toEqual([1, 2, 3]);
    expect(await db.changeset.count({ where: { path: "ADMIN", status: "APPLIED" } })).toBe(2);
  });

  it("moves a value when stored positions are equal", async () => {
    await db.setType.updateMany({ data: { position: 0 } });
    const start = await rows();
    const names = start.map((r) => r.values.name);
    expect((await save(moveEdits(config, start, start[2].id, -1))).status).toBe("saved");
    expect((await rows()).map((r) => r.values.name)).toEqual([names[0], names[2], names[1]]);
  });

  it("moves nothing past the ends of the list", async () => {
    const start = await rows();
    expect(moveEdits(config, start, start[0].id, -1)).toEqual([]);
    expect(moveEdits(config, start, start[2].id, 1)).toEqual([]);
  });

  it("deletes an unused value", async () => {
    const [first] = await rows();
    expect((await save([deleteEdit(config, first)])).status).toBe("saved");
    expect((await rows()).map((r) => r.values.name)).toEqual(["Second", "Third"]);
    const sets = await db.changeset.findMany({ include: { items: true } });
    expect(sets[0].items[0]).toMatchObject({ action: "DELETE", after: null });
  });

  it("counts the records that use a value, and refuses to delete it with a plain message", async () => {
    const [first] = await rows();
    const show = await db.entity.create({ data: { kind: "SHOW" } });
    await db.show.create({ data: { id: show.id } });
    for (const position of [1, 2]) {
      const set = await db.entity.create({ data: { kind: "SET" } });
      await db.set.create({ data: { id: set.id, showId: show.id, position, setTypeId: first.id } });
    }
    expect((await rows())[0].usedBy).toBe(2);
    expect((await rows())[1].usedBy).toBe(0);
    await expect(save([deleteEdit(config, first)])).rejects.toMatchObject({
      code: "invalid_input",
      message: expect.stringContaining("cannot be deleted"),
    });
    expect(await db.setType.count()).toBe(3);
    expect(await db.changeset.count({ where: { status: "APPLIED" } })).toBe(0);
  });

  it("refuses a stale version and writes nothing", async () => {
    const [first] = await rows();
    expect((await save([updateEdit(config, first, { ...first.values, name: "One" })!])).status).toBe("saved");
    const result = await save([updateEdit(config, first, { ...first.values, name: "Two" })!]);
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.messages[0]).toContain("changed since you opened it");
    expect((await rows())[0].values.name).toBe("One");
    expect(await db.changeset.count({ where: { status: "APPLIED" } })).toBe(1);
  });

  it("refuses a move that rests on a stale version", async () => {
    const start = await rows();
    await db.setType.update({ where: { id: start[1].id }, data: { rev: { increment: 1 } } });
    const result = await save(moveEdits(config, start, start[0].id, 1));
    expect(result.status).toBe("conflict");
    expect((await rows()).map((r) => r.values.name)).toEqual(["First", "Second", "Third"]);
  });

  it("never edits the rule key of a reference kind", async () => {
    const referenceKinds = listConfigBySlug("reference-kinds")!;
    const kind = await db.referenceKind.create({ data: { name: "part of", ruleKey: "part-of", position: 1 } });
    const [row] = await getListRows(referenceKinds);
    expect(row.values.ruleKey).toBe("part-of");
    const edit = updateEdit(referenceKinds, row, { ...row.values, name: "forms part of", ruleKey: "changed" })!;
    expect(edit.fields).toEqual({ name: "forms part of" });
    expect((await save([edit])).status).toBe("saved");
    expect(await db.referenceKind.findUniqueOrThrow({ where: { id: kind.id } })).toMatchObject({ name: "forms part of", ruleKey: "part-of" });
  });

  it("saves an empty optional text as not set, and a select value", async () => {
    const links = listConfigBySlug("link-systems")!;
    expect((await save([createEdit(links, { name: "Example", purpose: "READ", urlTemplate: "  " }, 1)])).status).toBe("saved");
    expect(await db.linkSystem.findFirstOrThrow()).toMatchObject({ name: "Example", purpose: "READ", urlTemplate: null });
  });
});
