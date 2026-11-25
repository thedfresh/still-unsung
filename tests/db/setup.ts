import { config } from "dotenv";
import { assertTestDatabase } from "../support/assert-test-database";

// Database tests read .env.test, never .env. A value already in the environment (CI) wins.
config({ path: ".env.test", quiet: true });

assertTestDatabase(process.env.DATABASE_URL);
