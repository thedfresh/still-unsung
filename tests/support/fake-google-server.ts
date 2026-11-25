import { startFakeGoogle } from "./fake-google.ts";

// Started by Playwright (playwright.config.ts) beside the app. Tests only.
await startFakeGoogle();
console.log("Fake Google is ready.");
