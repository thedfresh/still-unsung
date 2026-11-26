-- Items 120 and 121. Both changes are additive: a nullable column and a column with a default.
ALTER TABLE "shows" ADD COLUMN "legacyData" JSONB;
ALTER TABLE "works" ADD COLUMN "traditional" BOOLEAN NOT NULL DEFAULT false;
