import { MODEL, modelInfo } from "@/lib/content-access";
import { getPrisma } from "@/lib/db";
import { LIST_CONFIGS, type ListConfig } from "@/lib/lists/config";

/** One value of a list, for the page. Only the fields the page shows. */
export interface ListRow {
  id: number;
  rev: number;
  position: number;
  /** The configured fields: text as text, flags as booleans, an empty optional field as null. */
  values: Record<string, string | boolean | null>;
  /** How many records use this value. */
  usedBy: number;
}

interface ListDelegate {
  count(args?: object): Promise<number>;
  findMany(args: object): Promise<Array<Record<string, unknown>>>;
  groupBy(args: object): Promise<Array<Record<string, unknown> & { _count: { _all: number } }>>;
}

function delegateFor(type: string): ListDelegate {
  return (getPrisma() as unknown as Record<string, ListDelegate>)[modelInfo(type).delegate];
}

/** Every column of another model that points at this list: what keeps a value from being deleted. */
function referrersOf(type: string): Array<{ model: string; field: string }> {
  const out: Array<{ model: string; field: string }> = [];
  for (const [model, info] of Object.entries(MODEL.models)) {
    for (const [field, value] of Object.entries(info.fields)) if (value.fk === type && field !== "id") out.push({ model, field });
  }
  return out;
}

/** The number of values in each list: one query per list, a fixed number. */
export async function countLists(): Promise<Array<{ config: ListConfig; count: number }>> {
  return Promise.all(LIST_CONFIGS.map(async (config) => ({ config, count: await delegateFor(config.type).count() })));
}

/** How many records use each value, by ID: one grouped query per column that points at the list. */
async function usageOf(type: string): Promise<Map<number, number>> {
  const used = new Map<number, number>();
  for (const { model, field } of referrersOf(type)) {
    const groups = await delegateFor(model).groupBy({ by: [field], _count: { _all: true } });
    for (const group of groups) {
      const id = group[field] as number | null;
      if (id === null) continue;
      used.set(id, (used.get(id) ?? 0) + group._count._all);
    }
  }
  return used;
}

/** The values of one list in `position` order (ties by ID), each with its use count. */
export async function getListRows(config: ListConfig): Promise<ListRow[]> {
  const [rows, used] = await Promise.all([
    delegateFor(config.type).findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] }),
    usageOf(config.type),
  ]);
  return rows.map((row) => ({
    id: row.id as number,
    rev: row.rev as number,
    position: row.position as number,
    values: Object.fromEntries(config.fields.map((field) => [field.name, (row[field.name] ?? null) as string | boolean | null])),
    usedBy: used.get(row.id as number) ?? 0,
  }));
}
