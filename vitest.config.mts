import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Three projects. "unit" and "component" need no database and load no .env file. "db" runs against the
// test database, and its setup file refuses any other database. See docs/TESTING.md.
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        extends: false,
        resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/support/**/*.test.ts", "scripts/**/*.test.ts"],
        },
      },
      {
        // Client components: React in jsdom. Server Actions are passed in as plain functions.
        extends: false,
        resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
        test: {
          name: "component",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
        },
      },
      {
        extends: false,
        resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          setupFiles: ["tests/db/setup.ts"],
          // One test database: run test files one after the other.
          fileParallelism: false,
        },
      },
    ],
  },
});
