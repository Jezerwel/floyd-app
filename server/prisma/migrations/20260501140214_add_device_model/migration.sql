-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mqttPassword" TEXT NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_chipId_key" ON "Device"("chipId");
