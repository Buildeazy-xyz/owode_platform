/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `AjoGroup` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AjoGroup_name_key" ON "AjoGroup"("name");

-- AddForeignKey
ALTER TABLE "AjoMember" ADD CONSTRAINT "AjoMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AjoGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
