-- CreateTable
CREATE TABLE "FeedSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "time" TEXT NOT NULL,
    "daysOfWeek" TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
    "augerSpeed" INTEGER NOT NULL DEFAULT 768,
    "impellerSpeed" INTEGER NOT NULL DEFAULT 1023,
    "preSpinMs" INTEGER NOT NULL DEFAULT 1500,
    "feedMs" INTEGER NOT NULL DEFAULT 3000,
    "postSpinMs" INTEGER NOT NULL DEFAULT 1500,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FeedLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedMs" INTEGER NOT NULL,
    "augerSpeed" INTEGER NOT NULL,
    "impellerSpeed" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT
);

-- CreateTable
CREATE TABLE "AlertConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "lowFoodPct" INTEGER NOT NULL DEFAULT 30,
    "criticalFoodPct" INTEGER NOT NULL DEFAULT 10,
    "tempMin" REAL NOT NULL DEFAULT 20,
    "tempMax" REAL NOT NULL DEFAULT 32,
    "updatedAt" DATETIME NOT NULL
);
