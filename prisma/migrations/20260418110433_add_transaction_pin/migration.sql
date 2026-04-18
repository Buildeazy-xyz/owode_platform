-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appPin" TEXT,
ADD COLUMN     "password" TEXT,
ADD COLUMN     "transactionPin" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "pin" SET DEFAULT '';
