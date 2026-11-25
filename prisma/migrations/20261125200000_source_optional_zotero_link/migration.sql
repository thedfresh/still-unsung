-- Item 108: a source may have no Zotero link. This only relaxes NOT NULL, so it is additive.
-- The unique index on "zoteroKey" stays: PostgreSQL allows many NULL values in a unique index.
ALTER TABLE "sources" ALTER COLUMN "zoteroKey" DROP NOT NULL,
ALTER COLUMN "zoteroData" DROP NOT NULL,
ALTER COLUMN "syncedAt" DROP NOT NULL;

-- The editable list needs "article" (the interview import links articles). Skip it if it exists.
INSERT INTO "source_kinds" ("name")
SELECT 'article' WHERE NOT EXISTS (SELECT 1 FROM "source_kinds" WHERE "name" = 'article');
