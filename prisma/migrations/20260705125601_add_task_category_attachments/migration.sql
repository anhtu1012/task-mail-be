-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('WORK', 'PERSONAL');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "category" "TaskCategory" NOT NULL DEFAULT 'WORK';
