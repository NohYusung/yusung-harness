-- Domain stores ERD snapshots independently from deployment Architecture records.
CREATE TABLE "Domain" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "Domain_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Domain_projectId_idx" ON "Domain"("projectId");

-- Move only structurally recognizable Domain ERD v1 JSON and preserve IDs/timestamps.
INSERT INTO "Domain" ("id", "projectId", "createdAt", "updatedAt", "title", "content")
SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content"
FROM "Architecture"
WHERE CASE
  WHEN json_valid(content) THEN
    json_extract(content, '$.kind') = 'domain-erd'
    AND json_extract(content, '$.schemaVersion') = 1
    AND json_type(content, '$.entities') = 'array'
    AND json_type(content, '$.relationships') = 'array'
  ELSE 0
END;

-- Delete exactly the structured rows copied above; prose Architecture stays in place.
DELETE FROM "Architecture"
WHERE CASE
  WHEN json_valid(content) THEN
    json_extract(content, '$.kind') = 'domain-erd'
    AND json_extract(content, '$.schemaVersion') = 1
    AND json_type(content, '$.entities') = 'array'
    AND json_type(content, '$.relationships') = 'array'
  ELSE 0
END;
