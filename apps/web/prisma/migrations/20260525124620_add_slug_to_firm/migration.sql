-- AlterTable
ALTER TABLE "Firm" ADD COLUMN "slug" TEXT;

-- Note: This column was missing from the previous migration.
-- The Prisma schema was updated to include both clerkOrgId and slug,
-- but only clerkOrgId was added in the earlier migration.
