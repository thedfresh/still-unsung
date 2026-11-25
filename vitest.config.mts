import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Two projects. "unit" needs no database and loads no .env file. "db" runs against the
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
          include: ["src/**/*.test.ts", "tests/support/**/*.test.ts"],
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
