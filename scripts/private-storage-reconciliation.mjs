import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Pool } = pg;

export const privateStorageReconciliationPolicy = "PRIVATE-STORAGE-RECONCILIATION-2026-01";
export const defaultManagedPrefixes = Object.freeze([
  "conversations/",
  "partner-support/",
  "provider-verifications/",
  "service-requests/",
]);

const reconciliationLock = "max_service.private_storage_reconciliation";

export function classifyPrivateObjects({
  objects,
  references,
  cutoffAt,
  managedPrefixes = defaultManagedPrefixes,
}) {
  const referenceByKey = new Map(references.map((reference) => [reference.key, reference]));
  const objectByKey = new Map(objects.map((object) => [object.key, object]));
  const managedOrphans = [];
  const eligibleOrphans = [];
  let recentOrphans = 0;
  let ignoredObjects = 0;

  for (const object of objects) {
    if (referenceByKey.has(object.key)) continue;
    if (!managedPrefixes.some((prefix) => object.key.startsWith(prefix))) {
      ignoredObjects += 1;
      continue;
    }
    managedOrphans.push(object);
    if (!object.lastModified || object.lastModified > cutoffAt) {
      recentOrphans += 1;
      continue;
    }
    eligibleOrphans.push(object);
  }

  const missingReferences = references.filter((reference) => !objectByKey.has(reference.key));
  const sizeMismatches = references.filter((reference) => {
    const object = objectByKey.get(reference.key);
    return object && object.size !== reference.size;
  });

  return {
    managedOrphans,
    eligibleOrphans,
    missingReferences,
    sizeMismatches,
    recentOrphans,
    ignoredObjects,
  };
}

export async function reconcilePrivateStorage({
  databaseUrl,
  endpoint,
  region = "us-east-1",
  bucket,
  accessKeyId,
  secretAccessKey,
  apply = false,
  minimumAgeMs = 24 * 60 * 60 * 1_000,
  maxDeletes = 100,
  managedPrefixes = defaultManagedPrefixes,
  now = new Date(),
}) {
  requireConfiguration({ databaseUrl, endpoint, bucket, accessKeyId, secretAccessKey });
  if (!Number.isFinite(minimumAgeMs) || minimumAgeMs < 0) {
    throw new Error("A idade mínima do expurgo é inválida.");
  }
  if (!Number.isInteger(maxDeletes) || maxDeletes < 1 || maxDeletes > 1_000) {
    throw new Error("O limite de exclusões deve ficar entre 1 e 1000.");
  }

  const runId = randomUUID();
  const cutoffAt = new Date(now.getTime() - minimumAgeMs);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  const storage = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  let locked = false;
  let runRecorded = false;

  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [reconciliationLock],
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) throw new Error("Já existe uma reconciliação do cofre em andamento.");

    await client.query(`
      INSERT INTO private_storage_reconciliation_runs (
        id, policy_version, mode, status, cutoff_at
      ) VALUES ($1, $2, $3, 'running', $4)
    `, [runId, privateStorageReconciliationPolicy, apply ? "apply" : "dry_run", cutoffAt]);
    runRecorded = true;

    const [references, objects] = await Promise.all([
      loadReferences(client),
      listObjects(storage, bucket),
    ]);
    const classification = classifyPrivateObjects({
      objects,
      references,
      cutoffAt,
      managedPrefixes,
    });
    const deletionCandidates = classification.eligibleOrphans
      .sort((left, right) => left.key.localeCompare(right.key))
      .slice(0, maxDeletes);
    let deletedObjects = 0;
    let raceProtectedObjects = 0;

    if (apply && deletionCandidates.length > 0) {
      const currentReferences = new Set((await loadReferences(client)).map((reference) => reference.key));
      for (const candidate of deletionCandidates) {
        if (currentReferences.has(candidate.key)) {
          raceProtectedObjects += 1;
          continue;
        }
        let current;
        try {
          current = await storage.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: candidate.key,
          }));
        } catch (error) {
          if (storageStatus(error) === 404) {
            raceProtectedObjects += 1;
            continue;
          }
          throw error;
        }
        const changed = (
          !current.LastModified
          || current.LastModified > cutoffAt
          || !candidate.etag
          || normalizeEtag(current.ETag) !== normalizeEtag(candidate.etag)
        );
        if (changed) {
          raceProtectedObjects += 1;
          continue;
        }
        try {
          await storage.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: candidate.key,
            IfMatch: candidate.etag,
          }));
          deletedObjects += 1;
        } catch (error) {
          if (storageStatus(error) === 404 || storageStatus(error) === 412) {
            raceProtectedObjects += 1;
            continue;
          }
          throw error;
        }
      }
    }

    const report = {
      runId,
      policyVersion: privateStorageReconciliationPolicy,
      mode: apply ? "apply" : "dry_run",
      status: "succeeded",
      cutoffAt: cutoffAt.toISOString(),
      listedObjects: objects.length,
      referencedObjects: references.length,
      managedOrphans: classification.managedOrphans.length,
      eligibleOrphans: classification.eligibleOrphans.length,
      recentOrphans: classification.recentOrphans,
      missingReferences: classification.missingReferences.length,
      sizeMismatches: classification.sizeMismatches.length,
      ignoredObjects: classification.ignoredObjects,
      deletedObjects,
      raceProtectedObjects,
    };
    await finishRun(client, report);
    return report;
  } catch (error) {
    if (runRecorded) {
      await client.query(`
        UPDATE private_storage_reconciliation_runs
        SET status = 'failed', completed_at = now()
        WHERE id = $1 AND status = 'running'
      `, [runId]).catch(() => undefined);
    }
    throw error;
  } finally {
    if (locked) {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext($1))",
        [reconciliationLock],
      ).catch(() => undefined);
    }
    client.release();
    await pool.end();
    storage.destroy();
  }
}

async function loadReferences(client) {
  const result = await client.query(`
    SELECT object_key AS key, size_bytes::int AS size FROM provider_document_files
    UNION ALL
    SELECT object_key, size_bytes::int FROM service_request_attachments
    UNION ALL
    SELECT object_key, size_bytes::int FROM message_attachments
    UNION ALL
    SELECT object_key, size_bytes::int FROM partner_support_attachments
    ORDER BY key
  `);
  return result.rows;
}

async function listObjects(storage, bucket) {
  const objects = [];
  let continuationToken;
  do {
    const page = await storage.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
      MaxKeys: 1_000,
    }));
    for (const object of page.Contents ?? []) {
      if (!object.Key) continue;
      objects.push({
        key: object.Key,
        size: Number(object.Size ?? 0),
        lastModified: object.LastModified,
        etag: object.ETag,
      });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

async function finishRun(client, report) {
  await client.query(`
    UPDATE private_storage_reconciliation_runs
    SET
      status = 'succeeded',
      completed_at = now(),
      listed_objects = $2,
      referenced_objects = $3,
      managed_orphans = $4,
      eligible_orphans = $5,
      recent_orphans = $6,
      missing_references = $7,
      size_mismatches = $8,
      ignored_objects = $9,
      deleted_objects = $10,
      race_protected_objects = $11
    WHERE id = $1 AND status = 'running'
  `, [
    report.runId,
    report.listedObjects,
    report.referencedObjects,
    report.managedOrphans,
    report.eligibleOrphans,
    report.recentOrphans,
    report.missingReferences,
    report.sizeMismatches,
    report.ignoredObjects,
    report.deletedObjects,
    report.raceProtectedObjects,
  ]);
}

function configurationFromEnvironment() {
  return {
    databaseUrl: process.env.PRIVATE_STORAGE_RECONCILIATION_DATABASE_URL
      ?? process.env.MIGRATION_DATABASE_URL,
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
    bucket: process.env.OBJECT_STORAGE_BUCKET ?? "max-service-private",
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY,
  };
}

function parseArguments(argv) {
  const apply = argv.includes("--apply");
  const allowZeroAge = argv.includes("--allow-zero-age");
  const minimumAgeHours = numericOption(argv, "--minimum-age-hours", 24);
  const maxDeletes = numericOption(argv, "--max-deletes", 100);
  const intervalHours = optionalNumericOption(argv, "--interval-hours");
  if (!Number.isFinite(minimumAgeHours) || minimumAgeHours < 0 || (minimumAgeHours < 1 && !allowZeroAge)) {
    throw new Error("Use idade mínima de pelo menos 1 hora; zero exige --allow-zero-age.");
  }
  if (!Number.isInteger(maxDeletes) || maxDeletes < 1 || maxDeletes > 1_000) {
    throw new Error("--max-deletes deve ficar entre 1 e 1000.");
  }
  if (intervalHours !== undefined && (!Number.isFinite(intervalHours) || intervalHours < 1)) {
    throw new Error("--interval-hours deve ser de pelo menos 1 hora.");
  }
  return {
    apply,
    minimumAgeMs: minimumAgeHours * 60 * 60 * 1_000,
    maxDeletes,
    intervalMs: intervalHours === undefined ? undefined : intervalHours * 60 * 60 * 1_000,
  };
}

async function runCli() {
  const options = parseArguments(process.argv.slice(2));
  const configuration = configurationFromEnvironment();
  do {
    const report = await reconcilePrivateStorage({ ...configuration, ...options });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!options.intervalMs) return;
    if (!await waitForNextRun(options.intervalMs)) return;
  } while (true);
}

function numericOption(argv, name, fallback) {
  return optionalNumericOption(argv, name) ?? fallback;
}

function optionalNumericOption(argv, name) {
  const direct = argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct) return Number(direct.slice(name.length + 1));
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return Number(argv[index + 1]);
}

function waitForNextRun(milliseconds) {
  return new Promise((resolve) => {
    const finish = (continueRunning) => {
      clearTimeout(timeout);
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      resolve(continueRunning);
    };
    const stop = () => finish(false);
    const timeout = setTimeout(() => finish(true), milliseconds);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function requireConfiguration(configuration) {
  for (const [name, value] of Object.entries(configuration)) {
    if (!value) throw new Error(`Configuração obrigatória ausente: ${name}.`);
  }
}

function normalizeEtag(etag) {
  return String(etag ?? "").replaceAll("\"", "");
}

function storageStatus(error) {
  return typeof error === "object" && error !== null && "$metadata" in error
    ? Number(error.$metadata?.httpStatusCode ?? 0)
    : 0;
}

const launchedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launchedDirectly) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
