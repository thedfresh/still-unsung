import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import checkFile from "eslint-plugin-check-file";

// Long relative paths: use the `@/` alias instead. One `../` is fine.
const longRelative = {
  regex: "^\\.\\./\\.\\./",
  message: "Use the `@/` alias instead of a long relative path (docs/CONVENTIONS.md, section 1).",
};

// Only the data access layer may touch Prisma (docs/CONVENTIONS.md, sections 1 and 3).
const prismaRestriction = [
  {
    group: ["@prisma/*", "@/generated/*", "@/generated/**"],
    message: "Only src/lib/data/ may import from Prisma. Call the data layer instead.",
  },
  {
    group: ["@/lib/db"],
    message: "Only src/lib/data/ may import the Prisma client. Call the data layer instead.",
  },
];

// The cache functions that take a tag. The tag must come from src/lib/cache-tags.ts.
const tagCall = "CallExpression[callee.name=/^(cacheTag|updateTag|revalidateTag)$/]";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Size limits from docs/CONVENTIONS.md, section 7. Tests are exempt.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 120, skipBlankLines: true, skipComments: true }],
    },
  },
  // Import rules (sections 1 and 3): `@/` alias, and Prisma only in the data layer.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [longRelative, ...prismaRestriction] }],
    },
  },
  {
    // The data layer and the client factory it uses. Everything else in src/ is app code.
    files: ["src/lib/data/**/*.ts", "src/lib/db.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [longRelative] }],
    },
  },
  // Cache tags come from src/lib/cache-tags.ts, never from a string literal (section 5).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/cache-tags.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...[`${tagCall} > Literal`, `${tagCall} > TemplateLiteral`].map((selector) => ({
          selector,
          message: "Take cache tags from src/lib/cache-tags.ts, not a string literal.",
        })),
      ],
    },
  },
  // File names are kebab-case (section 1). `*.test.ts` is fine.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "src/**/*.{ts,tsx}": "KEBAB_CASE" },
        { ignoreMiddleExtensions: true },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client
    "src/generated/**",
    // Playwright output
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
