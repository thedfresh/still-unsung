import path from "node:path";
import type { Settings } from "./context.ts";

// Settings and safety checks of the legacy import (HSA-37). The script writes only to a
// development, test or staging database, and only outside the repository for its output.

export interface RunSettings extends Settings {
  targetUrl: string;
  legacyUrl: string;
  legacySchema: string;
  outputDir: string;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set. See the README, "Import from the old database".`);
  return value;
}

export function readSettings(env: Record<string, string | undefined>): RunSettings {
  return {
    targetUrl: required(env, "DATABASE_URL"),
    legacyUrl: required(env, "LEGACY_DATABASE_URL"),
    legacySchema: env.LEGACY_SCHEMA || "public",
    outputDir: required(env, "IMPORT_OUTPUT_DIR"),
    zotero: {
      legacySetlistList: required(env, "ZOTERO_KEY_LEGACY_SETLIST_LIST"),
      gdsets: required(env, "ZOTERO_KEY_GDSETS"),
      whitegum: required(env, "ZOTERO_KEY_WHITEGUM"),
    },
    curatorEmail: env.CURATOR_EMAIL || null,
    agentEmail: env.AGENT_EMAIL || null,
  };
}

function databaseOf(url: string): { host: string; port: string; name: string } {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: parsed.port || "5432", name: decodeURIComponent(parsed.pathname.replace(/^\//, "")) };
}

/**
 * The run empties the target database. Refuse the old copy, and refuse any name that is not a
 * dev, test or staging database. The script never touches old prod.
 */
export function assertSafeTarget(targetUrl: string, legacyUrl: string): void {
  const target = databaseOf(targetUrl);
  const legacy = databaseOf(legacyUrl);
  if (target.host === legacy.host && target.port === legacy.port && target.name === legacy.name) {
    throw new Error("DATABASE_URL and LEGACY_DATABASE_URL name the same database. Refusing to run.");
  }
  if (!/(_dev|_test|_staging)$/.test(target.name)) {
    throw new Error(`The target database "${target.name}" is not named *_dev, *_test or *_staging. Refusing to empty it.`);
  }
}

/** Proposal files and the report quote old notes, so they never go inside the repository. */
export function assertOutsideRepo(outputDir: string, repoRoot: string): void {
  const relative = path.relative(path.resolve(repoRoot), path.resolve(outputDir));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(`IMPORT_OUTPUT_DIR (${outputDir}) is inside the repository. Choose a folder outside it.`);
  }
}
