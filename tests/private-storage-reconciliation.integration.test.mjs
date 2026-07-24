import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  classifyPrivateObjects,
  reconcilePrivateStorage,
} from "../scripts/private-storage-reconciliation.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgresql://max_service_admin:max_service_admin_local@127.0.0.1:54329/max_service";
const storageConfiguration = {
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? "http://127.0.0.1:59000",
  region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
  bucket: process.env.OBJECT_STORAGE_BUCKET ?? "max-service-private",
  accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY ?? "max_service_local",
  secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? "max_service_objects_local",
};

test("classifica referências, divergências e órfãos sem expor chaves no relatório", () => {
  const cutoffAt = new Date("2026-07-24T12:00:00.000Z");
  const classification = classifyPrivateObjects({
    references: [
      { key: "service-requests/referenced", size: 10 },
      { key: "conversations/missing", size: 20 },
    ],
    objects: [
      {
        key: "service-requests/referenced",
        size: 11,
        lastModified: new Date("2026-07-23T10:00:00.000Z"),
        etag: "reference",
      },
      {
        key: "service-requests/orphan",
        size: 5,
        lastModified: new Date("2026-07-23T10:00:00.000Z"),
        etag: "orphan",
      },
      {
        key: "provider-verifications/recent",
        size: 5,
        lastModified: new Date("2026-07-24T12:00:00.001Z"),
        etag: "recent",
      },
      {
        key: "unknown/preserved",
        size: 5,
        lastModified: new Date("2026-07-23T10:00:00.000Z"),
        etag: "unknown",
      },
    ],
    cutoffAt,
  });

  assert.deepEqual(classification.managedOrphans.map((object) => object.key), [
    "service-requests/orphan",
    "provider-verifications/recent",
  ]);
  assert.deepEqual(classification.eligibleOrphans.map((object) => object.key), [
    "service-requests/orphan",
  ]);
  assert.deepEqual(classification.missingReferences.map((reference) => reference.key), [
    "conversations/missing",
  ]);
  assert.deepEqual(classification.sizeMismatches.map((reference) => reference.key), [
    "service-requests/referenced",
  ]);
  assert.equal(classification.recentOrphans, 1);
  assert.equal(classification.ignoredObjects, 1);
});

test("aplicação remove somente o órfão elegível e preserva arquivo referenciado", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const storage = new S3Client({
    endpoint: storageConfiguration.endpoint,
    region: storageConfiguration.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: storageConfiguration.accessKeyId,
      secretAccessKey: storageConfiguration.secretAccessKey,
    },
  });
  const testScope = `service-requests/reconciliation-test-${randomUUID()}/`;
  const orphanKey = `${testScope}orphan.bin`;
  const ignoredKey = `reconciliation-unmanaged/${randomUUID()}.bin`;
  const referencedFileId = randomUUID();
  const referencedKey = `provider-verifications/reconciliation-test/${referencedFileId}`;
  const bytes = Buffer.from("max-service-private-storage-reconciliation");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const createdRunIds = [];
  let referencedMetadataCreated = false;

  try {
    for (const key of [orphanKey, ignoredKey, referencedKey]) {
      await storage.send(new PutObjectCommand({
        Bucket: storageConfiguration.bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: "application/octet-stream",
      }));
    }
    const document = await pool.query(`
      SELECT
        document.id AS "documentId",
        document.verification_id AS "verificationId",
        verification.provider_id AS "providerId"
      FROM provider_document_checks document
      JOIN provider_verifications verification ON verification.id = document.verification_id
      ORDER BY document.created_at, document.id
      LIMIT 1
    `);
    assert.ok(document.rows[0], "A base sintética precisa conter um item documental.");
    await pool.query(`
      INSERT INTO provider_document_files (
        id,
        verification_id,
        document_check_id,
        provider_id,
        object_key,
        original_name,
        content_type,
        size_bytes,
        sha256,
        uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, 'reconciliation-test.pdf', 'application/pdf', $6, $7, $4)
    `, [
      referencedFileId,
      document.rows[0].verificationId,
      document.rows[0].documentId,
      document.rows[0].providerId,
      referencedKey,
      bytes.length,
      sha256,
    ]);
    referencedMetadataCreated = true;

    const dryRun = await reconcilePrivateStorage({
      databaseUrl,
      ...storageConfiguration,
      apply: false,
      minimumAgeMs: 0,
      maxDeletes: 10,
      managedPrefixes: [testScope],
    });
    createdRunIds.push(dryRun.runId);
    assert.equal(dryRun.status, "succeeded");
    assert.equal(dryRun.mode, "dry_run");
    assert.equal(dryRun.managedOrphans, 1);
    assert.equal(dryRun.eligibleOrphans, 1);
    assert.equal(dryRun.deletedObjects, 0);
    await storage.send(new HeadObjectCommand({
      Bucket: storageConfiguration.bucket,
      Key: orphanKey,
    }));

    const applied = await reconcilePrivateStorage({
      databaseUrl,
      ...storageConfiguration,
      apply: true,
      minimumAgeMs: 0,
      maxDeletes: 10,
      managedPrefixes: [testScope],
    });
    createdRunIds.push(applied.runId);
    assert.equal(applied.status, "succeeded");
    assert.equal(applied.mode, "apply");
    assert.equal(applied.managedOrphans, 1);
    assert.equal(applied.deletedObjects, 1);
    await assert.rejects(
      storage.send(new HeadObjectCommand({
        Bucket: storageConfiguration.bucket,
        Key: orphanKey,
      })),
      (error) => Number(error?.$metadata?.httpStatusCode ?? 0) === 404,
    );
    await storage.send(new HeadObjectCommand({
      Bucket: storageConfiguration.bucket,
      Key: ignoredKey,
    }));

    const referencedRun = await reconcilePrivateStorage({
      databaseUrl,
      ...storageConfiguration,
      apply: true,
      minimumAgeMs: 0,
      maxDeletes: 10,
      managedPrefixes: [referencedKey],
    });
    createdRunIds.push(referencedRun.runId);
    assert.equal(referencedRun.managedOrphans, 0);
    assert.equal(referencedRun.deletedObjects, 0);
    await storage.send(new HeadObjectCommand({
      Bucket: storageConfiguration.bucket,
      Key: referencedKey,
    }));

    const audit = await pool.query(`
      SELECT id, mode, status, managed_orphans AS "managedOrphans", deleted_objects AS "deletedObjects"
      FROM private_storage_reconciliation_runs
      WHERE id = ANY($1::uuid[])
      ORDER BY started_at
    `, [createdRunIds]);
    assert.equal(audit.rowCount, 3);
    assert.deepEqual(audit.rows.map((row) => row.status), ["succeeded", "succeeded", "succeeded"]);
    assert.deepEqual(audit.rows.map((row) => row.mode), ["dry_run", "apply", "apply"]);
    assert.deepEqual(audit.rows.map((row) => row.managedOrphans), [1, 1, 0]);
    assert.deepEqual(audit.rows.map((row) => row.deletedObjects), [0, 1, 0]);
  } finally {
    if (referencedMetadataCreated) {
      await pool.query(
        "DELETE FROM provider_document_files WHERE id = $1",
        [referencedFileId],
      ).catch(() => undefined);
    }
    await storage.send(new DeleteObjectCommand({
      Bucket: storageConfiguration.bucket,
      Key: orphanKey,
    })).catch(() => undefined);
    await storage.send(new DeleteObjectCommand({
      Bucket: storageConfiguration.bucket,
      Key: ignoredKey,
    })).catch(() => undefined);
    await storage.send(new DeleteObjectCommand({
      Bucket: storageConfiguration.bucket,
      Key: referencedKey,
    })).catch(() => undefined);
    storage.destroy();
    await pool.end();
  }
});
