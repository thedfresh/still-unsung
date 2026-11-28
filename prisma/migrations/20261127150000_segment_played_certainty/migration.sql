-- Item 126: a segment's "played" certainty, and a citation aspect for it. Additive.
ALTER TYPE "CitationAspect" ADD VALUE 'SEGMENT_PLAYED';
ALTER TABLE "segments" ADD COLUMN "playedCertainty" "Certainty" NOT NULL DEFAULT 'CONFIRMED';
