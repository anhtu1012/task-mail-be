/*
  Warnings:

  - You are about to drop the `zalo_oa_connections` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "zalo_oa_connections";

-- CreateTable
CREATE TABLE "zalo_bot_sessions" (
    "id" TEXT NOT NULL,
    "credential" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zalo_bot_sessions_pkey" PRIMARY KEY ("id")
);
