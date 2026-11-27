-- Item 123. Additive: a nullable column, an index and a foreign key.
ALTER TABLE "credits" ADD COLUMN "passageId" INTEGER;
CREATE INDEX "credits_passageId_idx" ON "credits"("passageId");
ALTER TABLE "credits" ADD CONSTRAINT "credits_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
