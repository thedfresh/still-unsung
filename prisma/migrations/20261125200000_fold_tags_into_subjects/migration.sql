-- Item 110: tags fold into subjects. Both tag tables are empty, so a plain drop loses no data
-- (checked before cutover). A record is now marked by a "part of" reference to a subject of
-- the new kind "highlight".

-- DropTable
DROP TABLE "tag_assignments";

-- DropTable
DROP TABLE "tags";

-- AlterTable
ALTER TABLE "subject_kinds" ADD COLUMN     "description" TEXT;

-- The new subject kind, added here so every database has it. Safe to run on a database that has it.
INSERT INTO "subject_kinds" ("name", "position", "description")
SELECT 'highlight', COALESCE(MAX("position"), -1) + 1,
       'The curator''s judgments, such as a notable show or an excellent version.'
FROM "subject_kinds"
ON CONFLICT ("name") DO NOTHING;
