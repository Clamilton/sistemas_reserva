/*
  Warnings:

  - Added the required column `columnKind` to the `StatusHistoryEntry` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Prioridade" AS ENUM ('baixa', 'media', 'alta');

-- AlterEnum
ALTER TYPE "ColumnKind" ADD VALUE 'paused';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'paused';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "recipientUserId" TEXT;

-- AlterTable
ALTER TABLE "StatusHistoryEntry" ADD COLUMN     "columnKind" "ColumnKind",
ADD COLUMN     "motivo" TEXT;

-- Backfill columnKind for existing rows from the current Column.kind
UPDATE "StatusHistoryEntry" s
SET "columnKind" = c."kind"
FROM "Column" c
WHERE c.id = s."columnId";

ALTER TABLE "StatusHistoryEntry" ALTER COLUMN "columnKind" SET NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "prioridade" "Prioridade" NOT NULL DEFAULT 'media';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isGestor" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
