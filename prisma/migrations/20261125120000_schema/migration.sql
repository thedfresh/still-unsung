-- The new schema (HSA-35). Replaces the placeholder table of the first migration.
-- Part 1: extension. Part 2: what Prisma generates (sort key in byte order). Part 3: check constraints.

-- Trigram search indexes need this extension (a trusted extension: the database owner may create it).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Certainty" AS ENUM ('CONFIRMED', 'PROBABLE', 'POSSIBLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ShowStatus" AS ENUM ('TOOK_PLACE', 'CANCELED', 'SPURIOUS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Delivery" AS ENUM ('SUNG', 'SUNG_A_CAPPELLA', 'PLAYED', 'SPOKEN');

-- CreateEnum
CREATE TYPE "Extent" AS ENUM ('COMPLETE', 'PARTIAL', 'FRAGMENT', 'ABORTED');

-- CreateEnum
CREATE TYPE "Join" AS ENUM ('STOPS', 'RUNS_INTO');

-- CreateEnum
CREATE TYPE "TitleStatus" AS ENUM ('KNOWN', 'WORKING_TITLE');

-- CreateEnum
CREATE TYPE "VocalRole" AS ENUM ('LEAD', 'HARMONY', 'BACKING');

-- CreateEnum
CREATE TYPE "BillRole" AS ENUM ('HEADLINER', 'OPENER', 'CO_BILL');

-- CreateEnum
CREATE TYPE "MemberOverride" AS ENUM ('MEMBER', 'GUEST');

-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('AS_CREDITED', 'ATTRIBUTED');

-- CreateEnum
CREATE TYPE "VersionOf" AS ENUM ('WORDS', 'TUNE');

-- CreateEnum
CREATE TYPE "PassageKind" AS ENUM ('FIXED', 'MOTIF');

-- CreateEnum
CREATE TYPE "PassageRole" AS ENUM ('VERSE', 'CHORUS', 'REFRAIN', 'BRIDGE', 'OTHER');

-- CreateEnum
CREATE TYPE "PassageChange" AS ENUM ('CHANGED', 'ADDED', 'LEFT_OUT');

-- CreateEnum
CREATE TYPE "SuiteStructure" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "CitationAspect" AS ENUM ('SHOW_DATE', 'SHOW_TIME', 'SHOW_PLACE', 'SHOW_STATUS', 'SHOW_SETLIST', 'SHOW_LINEUP', 'SHOW_BILLING', 'SEGMENT_IDENTIFICATION', 'SEGMENT_WORDS', 'SEGMENT_EXTENT', 'SEGMENT_CUT_MARKS', 'SEGMENT_VERSION', 'WORK_CREDIT', 'WORK_DATE', 'VERSION_WORDING', 'VERSION_FIRST_KNOWN_FROM', 'VERSION_CHANGED_BY', 'VARIANT_FIRST_KNOWN_FROM', 'VARIANT_ORIGIN', 'RENDITION_FIRST_KNOWN_FROM', 'RENDITION_ORIGIN');

-- CreateEnum
CREATE TYPE "LinkPurpose" AS ENUM ('LISTEN', 'WATCH', 'READ', 'IDENTIFY');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "ChangesetPath" AS ENUM ('ADMIN', 'MCP', 'IMPORT');

-- CreateEnum
CREATE TYPE "ChangesetStatus" AS ENUM ('PREVIEWED', 'APPLIED', 'UNDONE');

-- CreateEnum
CREATE TYPE "ChangeAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('SHOW', 'SET', 'SEGMENT', 'PORTION_ENTRY', 'SEGMENT_VARIANT', 'VOCAL_ENTRY', 'LINEUP_ENTRY', 'BILL_ENTRY', 'SHOW_GROUP', 'SHOW_GROUP_MEMBER', 'PERIOD', 'RECORDING', 'PLACE', 'PLACE_NAME', 'BAND', 'PERSON', 'WORK', 'WORK_SINGER', 'CREDIT', 'SUITE_PART', 'PASSAGE', 'VERSION', 'VERSION_BASIS', 'VERSION_PASSAGE', 'VARIANT', 'VARIANT_PASSAGE', 'RENDITION', 'APPEARANCE', 'REFERENCE', 'SUBJECT', 'SOURCE', 'SOURCE_WORK', 'GUIDE_PAGE');

-- DropTable
DROP TABLE "SystemCheck";

-- CreateTable
CREATE TABLE "entities" (
    "id" SERIAL NOT NULL,
    "kind" "EntityKind" NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shows" (
    "id" INTEGER NOT NULL,
    "dateYear" INTEGER,
    "dateMonth" INTEGER,
    "dateDay" INTEGER,
    "dateEndYear" INTEGER,
    "dateEndMonth" INTEGER,
    "dateEndDay" INTEGER,
    "dateAsWritten" TEXT,
    "dateCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "timeLabel" TEXT,
    "scheduledTime" TIME(0),
    "orderOnDate" INTEGER,
    "placeId" INTEGER,
    "placeNameId" INTEGER,
    "placeCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "billedAs" TEXT,
    "bandId" INTEGER,
    "showTypeId" INTEGER,
    "status" "ShowStatus" NOT NULL DEFAULT 'TOOK_PLACE',
    "statusCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "hunterParticipationCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "slug" TEXT,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sets" (
    "id" INTEGER NOT NULL,
    "showId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "setTypeId" INTEGER NOT NULL,
    "bandId" INTEGER,
    "incompleteReasonId" INTEGER,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segments" (
    "id" INTEGER NOT NULL,
    "setId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "sortKey" TEXT COLLATE "C" NOT NULL,
    "joinsNext" "Join" NOT NULL DEFAULT 'STOPS',
    "delivery" "Delivery",
    "workId" INTEGER,
    "workCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "wordsFromWorkId" INTEGER,
    "wordsFromCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "tuneFromWorkId" INTEGER,
    "tuneFromCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "wordsVersionId" INTEGER,
    "tuneVersionId" INTEGER,
    "extent" "Extent" NOT NULL DEFAULT 'COMPLETE',
    "portionNote" TEXT,
    "cutAtStart" BOOLEAN NOT NULL DEFAULT false,
    "cutAtEnd" BOOLEAN NOT NULL DEFAULT false,
    "hasGaps" BOOLEAN NOT NULL DEFAULT false,
    "deliveredById" INTEGER,
    "deliveredByCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "wordsAsHeard" TEXT,
    "transcribedById" INTEGER,
    "wordsPublic" BOOLEAN NOT NULL DEFAULT false,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portion_entries" (
    "id" INTEGER NOT NULL,
    "segmentId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "passageId" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portion_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_variants" (
    "id" INTEGER NOT NULL,
    "segmentId" INTEGER NOT NULL,
    "variantId" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segment_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocal_entries" (
    "id" INTEGER NOT NULL,
    "segmentId" INTEGER NOT NULL,
    "personId" INTEGER,
    "role" "VocalRole" NOT NULL DEFAULT 'LEAD',
    "delivery" "Delivery",
    "passageId" INTEGER,
    "scopeNote" TEXT,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineup_entries" (
    "id" INTEGER NOT NULL,
    "bandId" INTEGER,
    "showId" INTEGER,
    "setId" INTEGER,
    "segmentId" INTEGER,
    "personId" INTEGER NOT NULL,
    "dateYear" INTEGER,
    "dateMonth" INTEGER,
    "dateDay" INTEGER,
    "dateEndYear" INTEGER,
    "dateEndMonth" INTEGER,
    "dateEndDay" INTEGER,
    "dateAsWritten" TEXT,
    "dateCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "memberOverride" "MemberOverride",
    "sings" BOOLEAN NOT NULL DEFAULT false,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lineup_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineup_instruments" (
    "id" SERIAL NOT NULL,
    "lineupEntryId" INTEGER NOT NULL,
    "instrumentId" INTEGER NOT NULL,

    CONSTRAINT "lineup_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_entries" (
    "id" INTEGER NOT NULL,
    "showId" INTEGER,
    "showGroupId" INTEGER,
    "actBandId" INTEGER,
    "actPersonId" INTEGER,
    "role" "BillRole" NOT NULL,
    "position" INTEGER NOT NULL,
    "certainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" INTEGER NOT NULL,
    "showId" INTEGER NOT NULL,
    "recordingTypeId" INTEGER,
    "description" TEXT,
    "taperId" INTEGER,
    "lengthMinutes" INTEGER,
    "inCirculation" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "featuredText" TEXT,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" INTEGER NOT NULL,
    "placeKindId" INTEGER,
    "parentId" INTEGER,
    "slug" TEXT,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_names" (
    "id" INTEGER NOT NULL,
    "placeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_names_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "show_groups" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "showGroupKindId" INTEGER NOT NULL,
    "slug" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "show_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "show_group_members" (
    "id" INTEGER NOT NULL,
    "showGroupId" INTEGER NOT NULL,
    "showId" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "show_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "dateYear" INTEGER,
    "dateMonth" INTEGER,
    "dateDay" INTEGER,
    "dateEndYear" INTEGER,
    "dateEndMonth" INTEGER,
    "dateEndDay" INTEGER,
    "dateAsWritten" TEXT,
    "dateCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "bandId" INTEGER,
    "slug" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bands" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "isHunterBand" BOOLEAN NOT NULL DEFAULT true,
    "slug" TEXT,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "key" TEXT NOT NULL,
    "otherNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email" TEXT,
    "slug" TEXT,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_instruments" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "instrumentId" INTEGER NOT NULL,

    CONSTRAINT "person_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "works" (
    "id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "otherNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "titleStatus" "TitleStatus" NOT NULL DEFAULT 'KNOWN',
    "workKindId" INTEGER NOT NULL,
    "suiteStructure" "SuiteStructure",
    "defaultDelivery" "Delivery",
    "writtenForBandId" INTEGER,
    "writtenForPersonId" INTEGER,
    "writtenForCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "dateYear" INTEGER,
    "dateMonth" INTEGER,
    "dateDay" INTEGER,
    "dateEndYear" INTEGER,
    "dateEndMonth" INTEGER,
    "dateEndDay" INTEGER,
    "dateAsWritten" TEXT,
    "dateCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "placeWrittenId" INTEGER,
    "timeWritten" TEXT,
    "displayVersionId" INTEGER,
    "slug" TEXT,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_singers" (
    "id" INTEGER NOT NULL,
    "workId" INTEGER NOT NULL,
    "bandId" INTEGER,
    "personId" INTEGER,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_singers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credits" (
    "id" INTEGER NOT NULL,
    "workId" INTEGER,
    "versionId" INTEGER,
    "personId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "kind" "CreditKind" NOT NULL,
    "certainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "position" INTEGER NOT NULL DEFAULT 0,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suite_parts" (
    "id" INTEGER NOT NULL,
    "suiteWorkId" INTEGER NOT NULL,
    "partWorkId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suite_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passages" (
    "id" INTEGER NOT NULL,
    "workId" INTEGER NOT NULL,
    "kind" "PassageKind" NOT NULL DEFAULT 'FIXED',
    "label" TEXT NOT NULL,
    "role" "PassageRole",
    "motifKey" TEXT,
    "description" TEXT,
    "searchWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versions" (
    "id" INTEGER NOT NULL,
    "workId" INTEGER NOT NULL,
    "versionOf" "VersionOf" NOT NULL DEFAULT 'WORDS',
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "dateYear" INTEGER,
    "dateMonth" INTEGER,
    "dateDay" INTEGER,
    "dateEndYear" INTEGER,
    "dateEndMonth" INTEGER,
    "dateEndDay" INTEGER,
    "dateAsWritten" TEXT,
    "dateCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "firstKnownFromId" INTEGER,
    "firstKnownFromBandId" INTEGER,
    "firstKnownFromCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "changedById" INTEGER,
    "changedByCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "evidenceKindId" INTEGER,
    "wordingReviewed" BOOLEAN NOT NULL DEFAULT false,
    "wordingPublic" BOOLEAN NOT NULL DEFAULT false,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_bases" (
    "id" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "basedOnId" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "version_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_passages" (
    "id" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "passageId" INTEGER NOT NULL,
    "wording" TEXT,
    "startsStanza" BOOLEAN NOT NULL DEFAULT true,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "version_passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variants" (
    "id" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "firstKnownFromId" INTEGER,
    "firstKnownFromBandId" INTEGER,
    "originId" INTEGER,
    "originCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_passages" (
    "id" INTEGER NOT NULL,
    "variantId" INTEGER NOT NULL,
    "passageId" INTEGER NOT NULL,
    "change" "PassageChange" NOT NULL,
    "wording" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renditions" (
    "id" INTEGER NOT NULL,
    "segmentId" INTEGER NOT NULL,
    "passageId" INTEGER,
    "portionEntryId" INTEGER,
    "change" "PassageChange",
    "description" TEXT,
    "wording" TEXT,
    "firstKnownFromId" INTEGER,
    "firstKnownFromBandId" INTEGER,
    "originId" INTEGER,
    "originCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "renditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appearances" (
    "id" INTEGER NOT NULL,
    "segmentId" INTEGER NOT NULL,
    "passageId" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "otherNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subjectKindId" INTEGER,
    "slug" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" INTEGER NOT NULL,
    "zoteroKey" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "otherNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceKindId" INTEGER,
    "title" TEXT NOT NULL,
    "zoteroData" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "extractedText" TEXT,
    "licenseCode" TEXT,
    "licenseUrl" TEXT,
    "rightsHolder" TEXT,
    "creditLine" TEXT,
    "sourceUrl" TEXT,
    "slug" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_creators" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "creatorType" TEXT NOT NULL,
    "personId" INTEGER,

    CONSTRAINT "source_creators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_works" (
    "id" INTEGER NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "workId" INTEGER NOT NULL,
    "versionId" INTEGER,
    "place" TEXT,
    "position" INTEGER,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "references" (
    "id" INTEGER NOT NULL,
    "fromId" INTEGER NOT NULL,
    "toId" INTEGER NOT NULL,
    "referenceKindId" INTEGER NOT NULL,
    "certainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "saidById" INTEGER,
    "dateYear" INTEGER,
    "dateMonth" INTEGER,
    "dateDay" INTEGER,
    "dateEndYear" INTEGER,
    "dateEndMonth" INTEGER,
    "dateEndDay" INTEGER,
    "dateAsWritten" TEXT,
    "dateCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED',
    "note" TEXT,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citations" (
    "id" SERIAL NOT NULL,
    "entityId" INTEGER NOT NULL,
    "aspect" "CitationAspect",
    "sourceId" INTEGER,
    "recordingId" INTEGER,
    "place" TEXT,
    "contributorId" INTEGER,
    "citedOn" DATE,
    "excerpt" TEXT,
    "note" TEXT,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" SERIAL NOT NULL,
    "body" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_attachments" (
    "id" SERIAL NOT NULL,
    "noteId" INTEGER NOT NULL,
    "entityId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guide_pages" (
    "id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guide_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlinks" (
    "id" SERIAL NOT NULL,
    "fromNoteId" INTEGER,
    "fromGuidePageId" INTEGER,
    "toEntityId" INTEGER,
    "url" TEXT,

    CONSTRAINT "backlinks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_assignments" (
    "id" SERIAL NOT NULL,
    "tagId" INTEGER NOT NULL,
    "entityId" INTEGER NOT NULL,
    "note" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_ids" (
    "id" SERIAL NOT NULL,
    "entityId" INTEGER NOT NULL,
    "linkSystemId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "checkedAt" TIMESTAMP(3),
    "legacyId" TEXT,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" SERIAL NOT NULL,
    "path" TEXT NOT NULL,
    "entityId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changesets" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "path" "ChangesetPath" NOT NULL,
    "status" "ChangesetStatus" NOT NULL DEFAULT 'PREVIEWED',
    "sourceId" INTEGER,
    "recordingId" INTEGER,
    "contributorId" INTEGER,
    "place" TEXT,
    "ownKnowledge" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "previewToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "changesets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changeset_items" (
    "id" SERIAL NOT NULL,
    "changesetId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" INTEGER NOT NULL,
    "action" "ChangeAction" NOT NULL,
    "expectedRev" INTEGER,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "changeset_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "authenticators" (
    "credentialID" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "authenticators_pkey" PRIMARY KEY ("userId","credentialID")
);

-- CreateTable
CREATE TABLE "work_kinds" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "tickedByDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "work_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "includeInStats" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "set_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "show_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "includeInStats" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "show_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "show_group_kinds" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "show_group_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "credit_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_kinds" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ruleKey" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "reference_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_systems" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" "LinkPurpose" NOT NULL,
    "urlTemplate" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "link_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "recording_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_kinds" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "place_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_kinds" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "source_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_kinds" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "subject_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incomplete_reasons" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "incomplete_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_kinds" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "evidence_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entities_kind_idx" ON "entities"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "shows_slug_key" ON "shows"("slug");

-- CreateIndex
CREATE INDEX "shows_dateYear_dateMonth_dateDay_idx" ON "shows"("dateYear", "dateMonth", "dateDay");

-- CreateIndex
CREATE INDEX "shows_placeId_idx" ON "shows"("placeId");

-- CreateIndex
CREATE INDEX "sets_showId_position_idx" ON "sets"("showId", "position");

-- CreateIndex
CREATE INDEX "segments_setId_parentId_sortKey_idx" ON "segments"("setId", "parentId", "sortKey");

-- CreateIndex
CREATE INDEX "segments_workId_idx" ON "segments"("workId");

-- CreateIndex
CREATE INDEX "segments_wordsFromWorkId_idx" ON "segments"("wordsFromWorkId");

-- CreateIndex
CREATE INDEX "segments_tuneFromWorkId_idx" ON "segments"("tuneFromWorkId");

-- CreateIndex
CREATE UNIQUE INDEX "portion_entries_segmentId_position_key" ON "portion_entries"("segmentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "segment_variants_segmentId_variantId_key" ON "segment_variants"("segmentId", "variantId");

-- CreateIndex
CREATE INDEX "vocal_entries_segmentId_idx" ON "vocal_entries"("segmentId");

-- CreateIndex
CREATE INDEX "vocal_entries_personId_idx" ON "vocal_entries"("personId");

-- CreateIndex
CREATE INDEX "lineup_entries_bandId_idx" ON "lineup_entries"("bandId");

-- CreateIndex
CREATE INDEX "lineup_entries_showId_idx" ON "lineup_entries"("showId");

-- CreateIndex
CREATE INDEX "lineup_entries_setId_idx" ON "lineup_entries"("setId");

-- CreateIndex
CREATE INDEX "lineup_entries_segmentId_idx" ON "lineup_entries"("segmentId");

-- CreateIndex
CREATE INDEX "lineup_entries_personId_idx" ON "lineup_entries"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "lineup_instruments_lineupEntryId_instrumentId_key" ON "lineup_instruments"("lineupEntryId", "instrumentId");

-- CreateIndex
CREATE INDEX "bill_entries_showId_idx" ON "bill_entries"("showId");

-- CreateIndex
CREATE INDEX "bill_entries_showGroupId_idx" ON "bill_entries"("showGroupId");

-- CreateIndex
CREATE INDEX "bill_entries_actBandId_idx" ON "bill_entries"("actBandId");

-- CreateIndex
CREATE INDEX "bill_entries_actPersonId_idx" ON "bill_entries"("actPersonId");

-- CreateIndex
CREATE INDEX "recordings_showId_idx" ON "recordings"("showId");

-- CreateIndex
CREATE UNIQUE INDEX "places_slug_key" ON "places"("slug");

-- CreateIndex
CREATE INDEX "places_parentId_idx" ON "places"("parentId");

-- CreateIndex
CREATE INDEX "place_names_name_idx" ON "place_names"("name");

-- CreateIndex
CREATE INDEX "place_name_name_trgm_idx" ON "place_names" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "place_names_placeId_position_key" ON "place_names"("placeId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "place_names_id_placeId_key" ON "place_names"("id", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "show_groups_slug_key" ON "show_groups"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "show_group_members_showGroupId_showId_key" ON "show_group_members"("showGroupId", "showId");

-- CreateIndex
CREATE UNIQUE INDEX "periods_slug_key" ON "periods"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "bands_slug_key" ON "bands"("slug");

-- CreateIndex
CREATE INDEX "band_name_trgm_idx" ON "bands" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "people_key_key" ON "people"("key");

-- CreateIndex
CREATE UNIQUE INDEX "people_slug_key" ON "people"("slug");

-- CreateIndex
CREATE INDEX "people_otherNames_idx" ON "people" USING GIN ("otherNames");

-- CreateIndex
CREATE INDEX "person_name_trgm_idx" ON "people" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "person_instruments_personId_instrumentId_key" ON "person_instruments"("personId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "works_displayVersionId_key" ON "works"("displayVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "works_slug_key" ON "works"("slug");

-- CreateIndex
CREATE INDEX "works_otherNames_idx" ON "works" USING GIN ("otherNames");

-- CreateIndex
CREATE INDEX "works_workKindId_idx" ON "works"("workKindId");

-- CreateIndex
CREATE INDEX "work_title_trgm_idx" ON "works" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "work_singers_workId_idx" ON "work_singers"("workId");

-- CreateIndex
CREATE INDEX "credits_workId_idx" ON "credits"("workId");

-- CreateIndex
CREATE INDEX "credits_versionId_idx" ON "credits"("versionId");

-- CreateIndex
CREATE INDEX "credits_personId_idx" ON "credits"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "suite_parts_suiteWorkId_position_key" ON "suite_parts"("suiteWorkId", "position");

-- CreateIndex
CREATE INDEX "passages_workId_idx" ON "passages"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "passages_workId_motifKey_key" ON "passages"("workId", "motifKey");

-- CreateIndex
CREATE INDEX "versions_workId_idx" ON "versions"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "version_bases_versionId_basedOnId_key" ON "version_bases"("versionId", "basedOnId");

-- CreateIndex
CREATE UNIQUE INDEX "version_passages_versionId_position_key" ON "version_passages"("versionId", "position");

-- CreateIndex
CREATE INDEX "variants_versionId_idx" ON "variants"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "variant_passages_variantId_passageId_key" ON "variant_passages"("variantId", "passageId");

-- CreateIndex
CREATE INDEX "renditions_segmentId_idx" ON "renditions"("segmentId");

-- CreateIndex
CREATE INDEX "renditions_passageId_idx" ON "renditions"("passageId");

-- CreateIndex
CREATE INDEX "appearances_segmentId_idx" ON "appearances"("segmentId");

-- CreateIndex
CREATE INDEX "appearances_passageId_idx" ON "appearances"("passageId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_slug_key" ON "subjects"("slug");

-- CreateIndex
CREATE INDEX "subject_name_trgm_idx" ON "subjects" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "sources_zoteroKey_key" ON "sources"("zoteroKey");

-- CreateIndex
CREATE UNIQUE INDEX "sources_key_key" ON "sources"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sources_slug_key" ON "sources"("slug");

-- CreateIndex
CREATE INDEX "sources_otherNames_idx" ON "sources" USING GIN ("otherNames");

-- CreateIndex
CREATE INDEX "source_title_trgm_idx" ON "sources" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "source_creators_sourceId_position_key" ON "source_creators"("sourceId", "position");

-- CreateIndex
CREATE INDEX "source_works_sourceId_idx" ON "source_works"("sourceId");

-- CreateIndex
CREATE INDEX "source_works_workId_idx" ON "source_works"("workId");

-- CreateIndex
CREATE INDEX "references_fromId_idx" ON "references"("fromId");

-- CreateIndex
CREATE INDEX "references_toId_idx" ON "references"("toId");

-- CreateIndex
CREATE INDEX "citations_entityId_idx" ON "citations"("entityId");

-- CreateIndex
CREATE INDEX "citations_sourceId_idx" ON "citations"("sourceId");

-- CreateIndex
CREATE INDEX "citations_recordingId_idx" ON "citations"("recordingId");

-- CreateIndex
CREATE INDEX "note_attachments_entityId_idx" ON "note_attachments"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "note_attachments_noteId_entityId_key" ON "note_attachments"("noteId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "guide_pages_slug_key" ON "guide_pages"("slug");

-- CreateIndex
CREATE INDEX "backlinks_toEntityId_idx" ON "backlinks"("toEntityId");

-- CreateIndex
CREATE INDEX "backlinks_fromNoteId_idx" ON "backlinks"("fromNoteId");

-- CreateIndex
CREATE INDEX "backlinks_fromGuidePageId_idx" ON "backlinks"("fromGuidePageId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tag_assignments_tagId_entityId_key" ON "tag_assignments"("tagId", "entityId");

-- CreateIndex
CREATE INDEX "external_ids_linkSystemId_value_idx" ON "external_ids"("linkSystemId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "external_ids_entityId_linkSystemId_value_key" ON "external_ids"("entityId", "linkSystemId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "addresses_path_key" ON "addresses"("path");

-- CreateIndex
CREATE INDEX "addresses_entityId_idx" ON "addresses"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "changesets_previewToken_key" ON "changesets"("previewToken");

-- CreateIndex
CREATE INDEX "changesets_status_appliedAt_idx" ON "changesets"("status", "appliedAt");

-- CreateIndex
CREATE INDEX "changesets_isPublic_appliedAt_idx" ON "changesets"("isPublic", "appliedAt");

-- CreateIndex
CREATE INDEX "changeset_items_tableName_recordId_idx" ON "changeset_items"("tableName", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "changeset_items_changesetId_position_key" ON "changeset_items"("changesetId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "authenticators_credentialID_key" ON "authenticators"("credentialID");

-- CreateIndex
CREATE UNIQUE INDEX "work_kinds_name_key" ON "work_kinds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "set_types_name_key" ON "set_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "show_types_name_key" ON "show_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "show_group_kinds_name_key" ON "show_group_kinds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "credit_roles_name_key" ON "credit_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "reference_kinds_name_key" ON "reference_kinds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "reference_kinds_ruleKey_key" ON "reference_kinds"("ruleKey");

-- CreateIndex
CREATE UNIQUE INDEX "link_systems_name_key" ON "link_systems"("name");

-- CreateIndex
CREATE UNIQUE INDEX "recording_types_name_key" ON "recording_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_name_key" ON "instruments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "place_kinds_name_key" ON "place_kinds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "source_kinds_name_key" ON "source_kinds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subject_kinds_name_key" ON "subject_kinds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "incomplete_reasons_name_key" ON "incomplete_reasons"("name");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_kinds_name_key" ON "evidence_kinds"("name");

-- AddForeignKey
ALTER TABLE "shows" ADD CONSTRAINT "shows_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shows" ADD CONSTRAINT "shows_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shows" ADD CONSTRAINT "shows_placeNameId_placeId_fkey" FOREIGN KEY ("placeNameId", "placeId") REFERENCES "place_names"("id", "placeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shows" ADD CONSTRAINT "shows_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shows" ADD CONSTRAINT "shows_showTypeId_fkey" FOREIGN KEY ("showTypeId") REFERENCES "show_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sets" ADD CONSTRAINT "sets_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sets" ADD CONSTRAINT "sets_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sets" ADD CONSTRAINT "sets_setTypeId_fkey" FOREIGN KEY ("setTypeId") REFERENCES "set_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sets" ADD CONSTRAINT "sets_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sets" ADD CONSTRAINT "sets_incompleteReasonId_fkey" FOREIGN KEY ("incompleteReasonId") REFERENCES "incomplete_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_setId_fkey" FOREIGN KEY ("setId") REFERENCES "sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_workId_fkey" FOREIGN KEY ("workId") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_wordsFromWorkId_fkey" FOREIGN KEY ("wordsFromWorkId") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_tuneFromWorkId_fkey" FOREIGN KEY ("tuneFromWorkId") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_wordsVersionId_fkey" FOREIGN KEY ("wordsVersionId") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_tuneVersionId_fkey" FOREIGN KEY ("tuneVersionId") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_transcribedById_fkey" FOREIGN KEY ("transcribedById") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portion_entries" ADD CONSTRAINT "portion_entries_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portion_entries" ADD CONSTRAINT "portion_entries_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portion_entries" ADD CONSTRAINT "portion_entries_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_variants" ADD CONSTRAINT "segment_variants_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_variants" ADD CONSTRAINT "segment_variants_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_variants" ADD CONSTRAINT "segment_variants_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocal_entries" ADD CONSTRAINT "vocal_entries_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocal_entries" ADD CONSTRAINT "vocal_entries_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocal_entries" ADD CONSTRAINT "vocal_entries_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocal_entries" ADD CONSTRAINT "vocal_entries_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_setId_fkey" FOREIGN KEY ("setId") REFERENCES "sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_instruments" ADD CONSTRAINT "lineup_instruments_lineupEntryId_fkey" FOREIGN KEY ("lineupEntryId") REFERENCES "lineup_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_instruments" ADD CONSTRAINT "lineup_instruments_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_entries" ADD CONSTRAINT "bill_entries_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_entries" ADD CONSTRAINT "bill_entries_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_entries" ADD CONSTRAINT "bill_entries_showGroupId_fkey" FOREIGN KEY ("showGroupId") REFERENCES "show_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_entries" ADD CONSTRAINT "bill_entries_actBandId_fkey" FOREIGN KEY ("actBandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_entries" ADD CONSTRAINT "bill_entries_actPersonId_fkey" FOREIGN KEY ("actPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_recordingTypeId_fkey" FOREIGN KEY ("recordingTypeId") REFERENCES "recording_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_taperId_fkey" FOREIGN KEY ("taperId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_placeKindId_fkey" FOREIGN KEY ("placeKindId") REFERENCES "place_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_names" ADD CONSTRAINT "place_names_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_names" ADD CONSTRAINT "place_names_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "show_groups" ADD CONSTRAINT "show_groups_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "show_groups" ADD CONSTRAINT "show_groups_showGroupKindId_fkey" FOREIGN KEY ("showGroupKindId") REFERENCES "show_group_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "show_group_members" ADD CONSTRAINT "show_group_members_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "show_group_members" ADD CONSTRAINT "show_group_members_showGroupId_fkey" FOREIGN KEY ("showGroupId") REFERENCES "show_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "show_group_members" ADD CONSTRAINT "show_group_members_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bands" ADD CONSTRAINT "bands_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_instruments" ADD CONSTRAINT "person_instruments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_instruments" ADD CONSTRAINT "person_instruments_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_workKindId_fkey" FOREIGN KEY ("workKindId") REFERENCES "work_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_writtenForBandId_fkey" FOREIGN KEY ("writtenForBandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_writtenForPersonId_fkey" FOREIGN KEY ("writtenForPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_placeWrittenId_fkey" FOREIGN KEY ("placeWrittenId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_displayVersionId_fkey" FOREIGN KEY ("displayVersionId") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_singers" ADD CONSTRAINT "work_singers_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_singers" ADD CONSTRAINT "work_singers_workId_fkey" FOREIGN KEY ("workId") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_singers" ADD CONSTRAINT "work_singers_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_singers" ADD CONSTRAINT "work_singers_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_workId_fkey" FOREIGN KEY ("workId") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "credit_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_parts" ADD CONSTRAINT "suite_parts_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_parts" ADD CONSTRAINT "suite_parts_suiteWorkId_fkey" FOREIGN KEY ("suiteWorkId") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_parts" ADD CONSTRAINT "suite_parts_partWorkId_fkey" FOREIGN KEY ("partWorkId") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passages" ADD CONSTRAINT "passages_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passages" ADD CONSTRAINT "passages_workId_fkey" FOREIGN KEY ("workId") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versions" ADD CONSTRAINT "versions_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versions" ADD CONSTRAINT "versions_workId_fkey" FOREIGN KEY ("workId") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versions" ADD CONSTRAINT "versions_firstKnownFromId_fkey" FOREIGN KEY ("firstKnownFromId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versions" ADD CONSTRAINT "versions_firstKnownFromBandId_fkey" FOREIGN KEY ("firstKnownFromBandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versions" ADD CONSTRAINT "versions_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versions" ADD CONSTRAINT "versions_evidenceKindId_fkey" FOREIGN KEY ("evidenceKindId") REFERENCES "evidence_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_bases" ADD CONSTRAINT "version_bases_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_bases" ADD CONSTRAINT "version_bases_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_bases" ADD CONSTRAINT "version_bases_basedOnId_fkey" FOREIGN KEY ("basedOnId") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_passages" ADD CONSTRAINT "version_passages_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_passages" ADD CONSTRAINT "version_passages_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_passages" ADD CONSTRAINT "version_passages_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_firstKnownFromId_fkey" FOREIGN KEY ("firstKnownFromId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_firstKnownFromBandId_fkey" FOREIGN KEY ("firstKnownFromBandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_originId_fkey" FOREIGN KEY ("originId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_passages" ADD CONSTRAINT "variant_passages_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_passages" ADD CONSTRAINT "variant_passages_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_passages" ADD CONSTRAINT "variant_passages_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_portionEntryId_fkey" FOREIGN KEY ("portionEntryId") REFERENCES "portion_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_firstKnownFromId_fkey" FOREIGN KEY ("firstKnownFromId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_firstKnownFromBandId_fkey" FOREIGN KEY ("firstKnownFromBandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_originId_fkey" FOREIGN KEY ("originId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appearances" ADD CONSTRAINT "appearances_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appearances" ADD CONSTRAINT "appearances_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appearances" ADD CONSTRAINT "appearances_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_subjectKindId_fkey" FOREIGN KEY ("subjectKindId") REFERENCES "subject_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_sourceKindId_fkey" FOREIGN KEY ("sourceKindId") REFERENCES "source_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_creators" ADD CONSTRAINT "source_creators_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_creators" ADD CONSTRAINT "source_creators_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_works" ADD CONSTRAINT "source_works_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_works" ADD CONSTRAINT "source_works_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_works" ADD CONSTRAINT "source_works_workId_fkey" FOREIGN KEY ("workId") REFERENCES "works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_works" ADD CONSTRAINT "source_works_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_toId_fkey" FOREIGN KEY ("toId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_referenceKindId_fkey" FOREIGN KEY ("referenceKindId") REFERENCES "reference_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_saidById_fkey" FOREIGN KEY ("saidById") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_pages" ADD CONSTRAINT "guide_pages_id_fkey" FOREIGN KEY ("id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlinks" ADD CONSTRAINT "backlinks_fromNoteId_fkey" FOREIGN KEY ("fromNoteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlinks" ADD CONSTRAINT "backlinks_fromGuidePageId_fkey" FOREIGN KEY ("fromGuidePageId") REFERENCES "guide_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlinks" ADD CONSTRAINT "backlinks_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_assignments" ADD CONSTRAINT "tag_assignments_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_assignments" ADD CONSTRAINT "tag_assignments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_ids" ADD CONSTRAINT "external_ids_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_ids" ADD CONSTRAINT "external_ids_linkSystemId_fkey" FOREIGN KEY ("linkSystemId") REFERENCES "link_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changeset_items" ADD CONSTRAINT "changeset_items_changesetId_fkey" FOREIGN KEY ("changesetId") REFERENCES "changesets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authenticators" ADD CONSTRAINT "authenticators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =============================================================================
-- Part 3: check constraints ("exactly one", "at least one", "only when")
-- =============================================================================
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_one_level_check"
  CHECK (num_nonnulls("bandId", "showId", "setId", "segmentId") = 1);
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_dates_band_only_check"
  CHECK ("bandId" IS NOT NULL OR (
    "dateYear" IS NULL AND "dateMonth" IS NULL AND "dateDay" IS NULL
    AND "dateEndYear" IS NULL AND "dateEndMonth" IS NULL AND "dateEndDay" IS NULL
    AND "dateAsWritten" IS NULL));

ALTER TABLE "bill_entries" ADD CONSTRAINT "bill_entries_one_parent_check"
  CHECK (num_nonnulls("showId", "showGroupId") = 1);
ALTER TABLE "bill_entries" ADD CONSTRAINT "bill_entries_one_act_check"
  CHECK (num_nonnulls("actBandId", "actPersonId") = 1);

ALTER TABLE "credits" ADD CONSTRAINT "credits_one_target_check"
  CHECK (num_nonnulls("workId", "versionId") = 1);

ALTER TABLE "versions" ADD CONSTRAINT "versions_first_known_from_check"
  CHECK (num_nonnulls("firstKnownFromId", "firstKnownFromBandId") <= 1);
ALTER TABLE "variants" ADD CONSTRAINT "variants_first_known_from_check"
  CHECK (num_nonnulls("firstKnownFromId", "firstKnownFromBandId") <= 1);
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_first_known_from_check"
  CHECK (num_nonnulls("firstKnownFromId", "firstKnownFromBandId") <= 1);

ALTER TABLE "citations" ADD CONSTRAINT "citations_evidence_check"
  CHECK (num_nonnulls("sourceId", "recordingId", "contributorId") >= 1);
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_evidence_check"
  CHECK ("ownKnowledge" OR num_nonnulls("sourceId", "recordingId", "contributorId") >= 1);

ALTER TABLE "backlinks" ADD CONSTRAINT "backlinks_one_from_check"
  CHECK (num_nonnulls("fromNoteId", "fromGuidePageId") = 1);
ALTER TABLE "backlinks" ADD CONSTRAINT "backlinks_one_to_check"
  CHECK (num_nonnulls("toEntityId", "url") = 1);

ALTER TABLE "passages" ADD CONSTRAINT "passages_motif_key_check"
  CHECK (("motifKey" IS NOT NULL) = ("kind" = 'MOTIF'));

ALTER TABLE "segments" ADD CONSTRAINT "segments_parent_not_self_check" CHECK ("parentId" <> "id");
ALTER TABLE "places" ADD CONSTRAINT "places_parent_not_self_check" CHECK ("parentId" <> "id");
ALTER TABLE "version_bases" ADD CONSTRAINT "version_bases_not_self_check" CHECK ("versionId" <> "basedOnId");

-- Partial date shape on "shows": month 1-12, day 1-31, day only with month, month only with year.
ALTER TABLE "shows" ADD CONSTRAINT "shows_date_shape_check" CHECK (
  ("dateMonth" IS NULL OR "dateMonth" BETWEEN 1 AND 12)
  AND ("dateDay" IS NULL OR "dateDay" BETWEEN 1 AND 31)
  AND ("dateDay" IS NULL OR "dateMonth" IS NOT NULL)
  AND ("dateMonth" IS NULL OR "dateYear" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndMonth" BETWEEN 1 AND 12)
  AND ("dateEndDay" IS NULL OR "dateEndDay" BETWEEN 1 AND 31)
  AND ("dateEndDay" IS NULL OR "dateEndMonth" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndYear" IS NOT NULL));

-- Partial date shape on "lineup_entries": month 1-12, day 1-31, day only with month, month only with year.
ALTER TABLE "lineup_entries" ADD CONSTRAINT "lineup_entries_date_shape_check" CHECK (
  ("dateMonth" IS NULL OR "dateMonth" BETWEEN 1 AND 12)
  AND ("dateDay" IS NULL OR "dateDay" BETWEEN 1 AND 31)
  AND ("dateDay" IS NULL OR "dateMonth" IS NOT NULL)
  AND ("dateMonth" IS NULL OR "dateYear" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndMonth" BETWEEN 1 AND 12)
  AND ("dateEndDay" IS NULL OR "dateEndDay" BETWEEN 1 AND 31)
  AND ("dateEndDay" IS NULL OR "dateEndMonth" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndYear" IS NOT NULL));

-- Partial date shape on "periods": month 1-12, day 1-31, day only with month, month only with year.
ALTER TABLE "periods" ADD CONSTRAINT "periods_date_shape_check" CHECK (
  ("dateMonth" IS NULL OR "dateMonth" BETWEEN 1 AND 12)
  AND ("dateDay" IS NULL OR "dateDay" BETWEEN 1 AND 31)
  AND ("dateDay" IS NULL OR "dateMonth" IS NOT NULL)
  AND ("dateMonth" IS NULL OR "dateYear" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndMonth" BETWEEN 1 AND 12)
  AND ("dateEndDay" IS NULL OR "dateEndDay" BETWEEN 1 AND 31)
  AND ("dateEndDay" IS NULL OR "dateEndMonth" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndYear" IS NOT NULL));

-- Partial date shape on "works": month 1-12, day 1-31, day only with month, month only with year.
ALTER TABLE "works" ADD CONSTRAINT "works_date_shape_check" CHECK (
  ("dateMonth" IS NULL OR "dateMonth" BETWEEN 1 AND 12)
  AND ("dateDay" IS NULL OR "dateDay" BETWEEN 1 AND 31)
  AND ("dateDay" IS NULL OR "dateMonth" IS NOT NULL)
  AND ("dateMonth" IS NULL OR "dateYear" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndMonth" BETWEEN 1 AND 12)
  AND ("dateEndDay" IS NULL OR "dateEndDay" BETWEEN 1 AND 31)
  AND ("dateEndDay" IS NULL OR "dateEndMonth" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndYear" IS NOT NULL));

-- Partial date shape on "versions": month 1-12, day 1-31, day only with month, month only with year.
ALTER TABLE "versions" ADD CONSTRAINT "versions_date_shape_check" CHECK (
  ("dateMonth" IS NULL OR "dateMonth" BETWEEN 1 AND 12)
  AND ("dateDay" IS NULL OR "dateDay" BETWEEN 1 AND 31)
  AND ("dateDay" IS NULL OR "dateMonth" IS NOT NULL)
  AND ("dateMonth" IS NULL OR "dateYear" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndMonth" BETWEEN 1 AND 12)
  AND ("dateEndDay" IS NULL OR "dateEndDay" BETWEEN 1 AND 31)
  AND ("dateEndDay" IS NULL OR "dateEndMonth" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndYear" IS NOT NULL));

-- Partial date shape on "references": month 1-12, day 1-31, day only with month, month only with year.
ALTER TABLE "references" ADD CONSTRAINT "references_date_shape_check" CHECK (
  ("dateMonth" IS NULL OR "dateMonth" BETWEEN 1 AND 12)
  AND ("dateDay" IS NULL OR "dateDay" BETWEEN 1 AND 31)
  AND ("dateDay" IS NULL OR "dateMonth" IS NOT NULL)
  AND ("dateMonth" IS NULL OR "dateYear" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndMonth" BETWEEN 1 AND 12)
  AND ("dateEndDay" IS NULL OR "dateEndDay" BETWEEN 1 AND 31)
  AND ("dateEndDay" IS NULL OR "dateEndMonth" IS NOT NULL)
  AND ("dateEndMonth" IS NULL OR "dateEndYear" IS NOT NULL));

