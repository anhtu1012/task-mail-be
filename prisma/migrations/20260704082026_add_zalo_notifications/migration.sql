-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "deadline_notified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "zalo_oa_connections" (
    "id" TEXT NOT NULL,
    "oa_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zalo_oa_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "zalo_user_id" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zalo_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_link_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zalo_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zalo_oa_connections_oa_id_key" ON "zalo_oa_connections"("oa_id");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_accounts_user_id_key" ON "zalo_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_accounts_zalo_user_id_key" ON "zalo_accounts"("zalo_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_link_codes_code_key" ON "zalo_link_codes"("code");

-- AddForeignKey
ALTER TABLE "zalo_accounts" ADD CONSTRAINT "zalo_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_link_codes" ADD CONSTRAINT "zalo_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
