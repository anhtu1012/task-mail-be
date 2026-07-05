-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "source_mail_account_id" TEXT;

-- CreateIndex
CREATE INDEX "tasks_source_mail_account_id_idx" ON "tasks"("source_mail_account_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_mail_account_id_fkey" FOREIGN KEY ("source_mail_account_id") REFERENCES "mail_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
