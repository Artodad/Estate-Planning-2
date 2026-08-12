-- AlterTable
ALTER TABLE "Firm" ADD COLUMN "clerkOrgId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Firm_clerkOrgId_key" ON "Firm"("clerkOrgId");

-- Note: This migration adds support for linking Clerk Organizations to internal Firms.
-- clerkOrgId is nullable because we may create Firms before the Clerk org is fully set up in some flows,
-- but we will enforce the link in application logic.