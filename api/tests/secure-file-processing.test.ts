import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import test from "node:test";
import {
  AntimalwareUnavailableError,
  ClamAvAntimalwareScanner,
} from "../storage/clamav-antimalware-scanner.js";
import type {
  AntimalwareScanner,
  IdempotencyBeginResult,
  IdempotencyClaim,
  SecureFileIdempotencyStore,
  SecureFileObjectStore,
  SecureFileRecord,
  SecureFileRepository,
  SecureFileTransitionInput,
} from "../storage/secure-file-contracts.js";
import {
  executeSecureFileIdempotently,
  SecureFileIdempotencyConflictError,
} from "../storage/secure-file-idempotency.js";
import {
  secureFilePurgeEligibility,
  SecureFilePurgeService,
} from "../storage/secure-file-purge.js";
import {
  scanWithRetry,
  SecureFileScanProcessor,
} from "../storage/secure-file-scan.js";
import {
  assertSecureFileTransition,
  canTransitionSecureFile,
} from "../storage/secure-file-state-machine.js";
import {
  SecureFileValidationError,
  validateSecureFile,
} from "../storage/secure-file-validation.js";

const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const passivePdf = Buffer.from([
  "%PDF-1.4",
  "1 0 obj",
  "<< /Type /Catalog >>",
  "endobj",
  "xref",
  "0 2",
  "0000000000 65535 f ",
  "0000000009 00000 n ",
  "trailer",
  "<< /Root 1 0 R /Size 2 >>",
  "startxref",
  "45",
  "%%EOF",
  "",
].join("\n"), "latin1");

test("expõe somente as transições explícitas e mantém EXPIRED terminal", () => {
  assert.equal(canTransitionSecureFile("RECEIVED", "QUARANTINED"), true);
  assert.equal(canTransitionSecureFile("QUARANTINED", "APPROVED"), false);
  assert.equal(canTransitionSecureFile("SCANNING", "APPROVED"), true);
  assert.equal(canTransitionSecureFile("ERROR", "QUARANTINED"), true);
  assert.equal(canTransitionSecureFile("EXPIRED", "RECEIVED"), false);
  assert.throws(() => assertSecureFileTransition("QUARANTINED", "APPROVED"), /inválida/);
});

test("valida PNG completo, CRC, MIME, extensão e política da finalidade", () => {
  const validated = validateSecureFile({
    id: randomUUID(),
    purpose: "service_request_image",
    originalName: "evidencia.png",
    declaredContentType: "image/png",
    bytes: onePixelPng,
  });
  assert.equal(validated.detectedContentType, "image/png");
  assert.equal(validated.sizeBytes, onePixelPng.length);
  assert.match(validated.sha256, /^[a-f0-9]{64}$/);

  const corrupt = Buffer.from(onePixelPng);
  corrupt[corrupt.length - 5] ^= 0xff;
  assert.throws(
    () => validateSecureFile({
      id: randomUUID(),
      purpose: "service_request_image",
      originalName: "evidencia.png",
      declaredContentType: "image/png",
      bytes: corrupt,
    }),
    (error) => error instanceof SecureFileValidationError && error.code === "MALFORMED_FILE",
  );
  assert.throws(
    () => validateSecureFile({
      id: randomUUID(),
      purpose: "service_request_image",
      originalName: "evidencia.pdf",
      declaredContentType: "application/pdf",
      bytes: passivePdf,
    }),
    (error) => error instanceof SecureFileValidationError && error.code === "TYPE_NOT_ALLOWED",
  );
});

test("aceita PDF estrutural passivo e bloqueia conteúdo ativo", () => {
  assert.equal(validateSecureFile({
    id: randomUUID(),
    purpose: "provider_document",
    originalName: "documento.pdf",
    declaredContentType: "application/pdf",
    bytes: passivePdf,
  }).detectedContentType, "application/pdf");

  const activePdf = Buffer.from(passivePdf.toString("latin1").replace(
    "<< /Type /Catalog >>",
    "<< /Type /Catalog /OpenAction 2 0 R >>",
  ), "latin1");
  assert.throws(
    () => validateSecureFile({
      id: randomUUID(),
      purpose: "provider_document",
      originalName: "documento.pdf",
      declaredContentType: "application/pdf",
      bytes: activePdf,
    }),
    (error) => error instanceof SecureFileValidationError && error.code === "ACTIVE_PDF_CONTENT",
  );
});

test("fala o protocolo INSTREAM do ClamAV e rejeita EICAR", async () => {
  const server = createServer((socket) => {
    let received = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      if (received.includes(Buffer.from(eicar))) {
        socket.write("stream: Eicar-Test-Signature FOUND\0");
      }
    });
  });
  const address = await listen(server);
  try {
    const scanner = new ClamAvAntimalwareScanner({
      host: "127.0.0.1",
      port: address.port,
      connectTimeoutMilliseconds: 500,
    });
    const verdict = await scanner.scan({
      fileId: randomUUID(),
      originalName: "eicar.txt",
      contentType: "text/plain",
      sha256: "a".repeat(64),
      bytes: Buffer.from(eicar),
    }, new AbortController().signal);
    assert.equal(verdict.status, "INFECTED");
    if (verdict.status === "INFECTED") assert.equal(verdict.signature, "Eicar-Test-Signature");
  } finally {
    await close(server);
  }
});

test("indisponibilidade e timeout esgotam retry em ERROR sem aprovar", async () => {
  const unavailable: AntimalwareScanner = {
    async scan() {
      throw new AntimalwareUnavailableError();
    },
  };
  const unavailableOutcome = await scanWithRetry(unavailable, scanInput(), {
    maximumAttempts: 2,
    timeoutMilliseconds: 100,
    baseDelayMilliseconds: 0,
  });
  assert.deepEqual(unavailableOutcome, {
    status: "ERROR",
    attempts: 2,
    errorCode: "SCANNER_UNAVAILABLE",
  });

  const hanging: AntimalwareScanner = {
    scan() {
      return new Promise(() => undefined);
    },
  };
  const timeoutOutcome = await scanWithRetry(hanging, scanInput(), {
    maximumAttempts: 1,
    timeoutMilliseconds: 20,
    baseDelayMilliseconds: 0,
  });
  assert.deepEqual(timeoutOutcome, {
    status: "ERROR",
    attempts: 1,
    errorCode: "SCANNER_TIMEOUT",
  });
});

test("processador promove somente CLEAN e faz fail-closed em indisponibilidade", async () => {
  const cleanRecord = secureRecord();
  const cleanRepository = new MemoryRepository(cleanRecord);
  const cleanStore = new MemoryObjectStore();
  const cleanScanner: AntimalwareScanner = {
    async scan() {
      return {
        status: "CLEAN",
        engine: "test",
        engineVersion: "1",
        definitionsVersion: "1",
      };
    },
  };
  const approved = await new SecureFileScanProcessor(
    cleanRepository,
    cleanStore,
    cleanScanner,
    { maximumAttempts: 1, timeoutMilliseconds: 100, baseDelayMilliseconds: 0 },
  ).process(cleanRecord, onePixelPng);
  assert.equal(approved.state, "APPROVED");
  assert.equal(cleanStore.promoted.length, 1);

  const unavailableRecord = secureRecord();
  const unavailableRepository = new MemoryRepository(unavailableRecord);
  const unavailableStore = new MemoryObjectStore();
  const unavailableScanner: AntimalwareScanner = {
    async scan() {
      throw new AntimalwareUnavailableError();
    },
  };
  const errored = await new SecureFileScanProcessor(
    unavailableRepository,
    unavailableStore,
    unavailableScanner,
    { maximumAttempts: 2, timeoutMilliseconds: 100, baseDelayMilliseconds: 0 },
  ).process(unavailableRecord, onePixelPng);
  assert.equal(errored.state, "ERROR");
  assert.equal(unavailableStore.promoted.length, 0);
});

test("expurgo respeita retenção/legal hold e repete DELETE de EXPIRED com segurança", async () => {
  const now = new Date("2026-07-25T12:00:00.000Z");
  const held = {
    ...secureRecord(),
    state: "APPROVED" as const,
    approvedObjectKey: "approved/service_request_image/file",
    retentionUntil: new Date("2026-07-24T12:00:00.000Z"),
    legalHold: true,
  };
  assert.deepEqual(secureFilePurgeEligibility(held, now), {
    eligible: false,
    reasonCode: "LEGAL_HOLD",
  });

  const eligible = { ...held, legalHold: false };
  const repository = new MemoryRepository(eligible);
  const store = new MemoryObjectStore();
  const service = new SecureFilePurgeService(repository, store);
  const first = await service.purge(eligible, now);
  assert.equal(first.record.state, "EXPIRED");
  assert.equal(first.replayed, false);
  const second = await service.purge(first.record, now);
  assert.equal(second.replayed, true);
  assert.deepEqual(store.removed, [
    eligible.quarantineObjectKey,
    eligible.approvedObjectKey,
    eligible.quarantineObjectKey,
    eligible.approvedObjectKey,
  ]);
});

test("componente idempotente reproduz resposta e rejeita reutilização divergente", async () => {
  const store = new MemoryIdempotencyStore<{ id: string }>();
  const key = "secure-file-key-0001";
  let executions = 0;
  const first = await executeSecureFileIdempotently(store, key, { sha256: "a" }, async () => {
    executions += 1;
    return { id: "file-1" };
  });
  const replay = await executeSecureFileIdempotently(store, key, { sha256: "a" }, async () => {
    executions += 1;
    return { id: "file-2" };
  });
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.value.id, "file-1");
  assert.equal(executions, 1);
  await assert.rejects(
    executeSecureFileIdempotently(store, key, { sha256: "b" }, async () => ({ id: "file-3" })),
    SecureFileIdempotencyConflictError,
  );
});

function scanInput() {
  return {
    fileId: randomUUID(),
    originalName: "arquivo.png",
    contentType: "image/png",
    sha256: "a".repeat(64),
    bytes: onePixelPng,
  };
}

function secureRecord(): SecureFileRecord {
  const id = randomUUID();
  return {
    id,
    purpose: "service_request_image",
    state: "QUARANTINED",
    version: 1,
    quarantineObjectKey: `quarantine/service_request_image/${id}`,
    approvedObjectKey: null,
    originalName: "arquivo.png",
    declaredContentType: "image/png",
    detectedContentType: "image/png",
    sizeBytes: onePixelPng.length,
    sha256: "a".repeat(64),
    scanAttempts: 0,
    retentionUntil: null,
    expiresAt: new Date("2026-07-26T12:00:00.000Z"),
    legalHold: false,
  };
}

class MemoryRepository implements SecureFileRepository {
  constructor(private record: SecureFileRecord) {}

  async get(id: string) {
    return this.record.id === id ? this.record : null;
  }

  async transition(input: SecureFileTransitionInput) {
    if (
      input.id !== this.record.id
      || input.expectedVersion !== this.record.version
      || input.from !== this.record.state
    ) return null;
    this.record = {
      ...this.record,
      state: input.to,
      version: this.record.version + 1,
      scanAttempts: input.scanAttempts ?? this.record.scanAttempts,
      approvedObjectKey: input.approvedObjectKey === undefined
        ? this.record.approvedObjectKey
        : input.approvedObjectKey,
    };
    return this.record;
  }
}

class MemoryObjectStore implements SecureFileObjectStore {
  readonly promoted: string[] = [];
  readonly removed: string[] = [];

  async promote(input: { quarantineObjectKey: string; approvedObjectKey: string }) {
    this.promoted.push(`${input.quarantineObjectKey}->${input.approvedObjectKey}`);
  }

  async remove(objectKey: string) {
    this.removed.push(objectKey);
  }
}

class MemoryIdempotencyStore<T> implements SecureFileIdempotencyStore<T> {
  private requestHash: string | null = null;
  private response: T | null = null;
  private claim: IdempotencyClaim | null = null;

  async begin(key: string, requestHash: string): Promise<IdempotencyBeginResult<T>> {
    if (this.requestHash && this.requestHash !== requestHash) return { status: "CONFLICT" };
    if (this.response) return { status: "REPLAY", response: this.response };
    if (this.claim) return { status: "IN_PROGRESS" };
    this.requestHash = requestHash;
    this.claim = { key, requestHash, leaseId: randomUUID() };
    return { status: "STARTED", claim: this.claim };
  }

  async complete(claim: IdempotencyClaim, response: T) {
    assert.equal(claim.leaseId, this.claim?.leaseId);
    this.response = response;
    this.claim = null;
  }

  async release(claim: IdempotencyClaim) {
    if (claim.leaseId === this.claim?.leaseId) {
      this.claim = null;
      this.requestHash = null;
    }
  }
}

async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Servidor de teste sem porta TCP.");
  return address;
}

async function close(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
