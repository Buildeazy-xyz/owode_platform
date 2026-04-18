/*
  Warnings:

  - You are about to drop the column `createdAt` on the `AjoMember` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[groupId,userId]` on the table `AjoMember` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[groupId,position]` on the table `AjoMember` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('PENDING', 'SOFT_RECOVERY', 'HARD_RECOVERY', 'RECOVERED', 'WRITTEN_OFF');

-- AlterTable
ALTER TABLE "AjoGroup" ADD COLUMN     "avatarCoveredCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "guaranteeFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "guaranteePoolBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "isGuaranteed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxAvatarCoverage" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "nextPayoutDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AjoMember" DROP COLUMN "createdAt",
ADD COLUMN     "isAvatar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "payoutReceived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "AjoCycle" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "recipientId" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "avatarCovered" BOOLEAN NOT NULL DEFAULT false,
    "avatarAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CycleStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AjoCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultRecord" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "amountOwed" DOUBLE PRECISION NOT NULL,
    "penaltyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avatarCovered" BOOLEAN NOT NULL DEFAULT true,
    "recoveryStatus" "RecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "gracePeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" TIMESTAMP(3),

    CONSTRAINT "DefaultRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuaranteePool" (
    "id" TEXT NOT NULL,
    "totalBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCollected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPaidOut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuaranteePool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AjoMember_groupId_userId_key" ON "AjoMember"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AjoMember_groupId_position_key" ON "AjoMember"("groupId", "position");

-- AddForeignKey
ALTER TABLE "AjoMember" ADD CONSTRAINT "AjoMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjoCycle" ADD CONSTRAINT "AjoCycle_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AjoGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultRecord" ADD CONSTRAINT "DefaultRecord_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AjoGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultRecord" ADD CONSTRAINT "DefaultRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
