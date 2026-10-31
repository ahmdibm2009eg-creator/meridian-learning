-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Answer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "response" TEXT NOT NULL DEFAULT 'null',
    "isCorrect" BOOLEAN,
    "pointsAwarded" REAL NOT NULL DEFAULT 0,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "eliminated" TEXT NOT NULL DEFAULT '[]',
    "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
    "usedAiHelp" BOOLEAN NOT NULL DEFAULT false,
    "selfAssessment" TEXT,
    "clientRev" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Answer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Answer" ("attemptId", "eliminated", "flagged", "id", "isCorrect", "pointsAwarded", "questionId", "response", "selfAssessment", "sequence", "timeSpentSec", "updatedAt", "usedAiHelp") SELECT "attemptId", "eliminated", "flagged", "id", "isCorrect", "pointsAwarded", "questionId", "response", "selfAssessment", "sequence", "timeSpentSec", "updatedAt", "usedAiHelp" FROM "Answer";
DROP TABLE "Answer";
ALTER TABLE "new_Answer" RENAME TO "Answer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
