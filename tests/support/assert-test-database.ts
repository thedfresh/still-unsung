/**
 * Refuse to run database tests against anything but a test database.
 * A test database has a name that ends in `_test`, for example `still_unsung_test`.
 */
export function assertTestDatabase(url: string | undefined): void {
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Database tests need a test database: copy .env.test.example to .env.test.",
    );
  }
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("DATABASE_URL is not a valid database address. Database tests did not run.");
  }
  if (!/_test$/.test(name)) {
    throw new Error(
      `Refusing to run database tests: the database "${name}" is not a test database. ` +
        'A test database name ends in "_test". Check .env.test.',
    );
  }
}
