import type {
  AntimalwareScanInput,
  AntimalwareScanner,
  ScanRetryPolicy,
  SecureFileObjectStore,
  SecureFileRecord,
  SecureFileRepository,
  SecureFileScanOutcome,
} from "./secure-file-contracts.js";
import {
  AntimalwareProtocolError,
  AntimalwareUnavailableError,
} from "./clamav-antimalware-scanner.js";
import { assertSecureFileTransition } from "./secure-file-state-machine.js";

const defaultRetryPolicy: ScanRetryPolicy = {
  maximumAttempts: 3,
  timeoutMilliseconds: 10_000,
  baseDelayMilliseconds: 250,
};

type ScanErrorOutcome = Extract<SecureFileScanOutcome, { status: "ERROR" }>;

class ScanTimeoutError extends Error {
  constructor() {
    super("O scan antimalware excedeu o tempo limite.");
    this.name = "ScanTimeoutError";
  }
}

export class SecureFileConcurrencyError extends Error {
  constructor() {
    super("O arquivo privado foi alterado por outro processamento.");
    this.name = "SecureFileConcurrencyError";
  }
}

export async function scanWithRetry(
  scanner: AntimalwareScanner,
  input: AntimalwareScanInput,
  policy: ScanRetryPolicy = defaultRetryPolicy,
  sleep: (milliseconds: number) => Promise<void> = defaultSleep,
): Promise<SecureFileScanOutcome> {
  validateRetryPolicy(policy);
  let lastErrorCode: ScanErrorOutcome["errorCode"] = "SCANNER_ERROR";

  for (let attempt = 1; attempt <= policy.maximumAttempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new ScanTimeoutError());
      }, policy.timeoutMilliseconds);
    });
    try {
      const verdict = await Promise.race([
        scanner.scan(input, controller.signal),
        timeoutPromise,
      ]);
      return verdict.status === "CLEAN"
        ? { status: "CLEAN", attempts: attempt, verdict }
        : { status: "INFECTED", attempts: attempt, verdict };
    } catch (error) {
      lastErrorCode = classifyScanError(error, timedOut);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (attempt < policy.maximumAttempts) {
      await sleep(policy.baseDelayMilliseconds * (2 ** (attempt - 1)));
    }
  }

  return {
    status: "ERROR",
    attempts: policy.maximumAttempts,
    errorCode: lastErrorCode,
  };
}

export class SecureFileScanProcessor {
  constructor(
    private readonly repository: SecureFileRepository,
    private readonly objectStore: SecureFileObjectStore,
    private readonly scanner: AntimalwareScanner,
    private readonly retryPolicy: ScanRetryPolicy = defaultRetryPolicy,
  ) {}

  async process(record: SecureFileRecord, bytes: Buffer) {
    if (record.state !== "QUARANTINED") {
      throw new Error("Somente arquivos em QUARANTINED podem iniciar scan.");
    }
    assertSecureFileTransition(record.state, "SCANNING");
    const scanning = await this.repository.transition({
      id: record.id,
      expectedVersion: record.version,
      from: "QUARANTINED",
      to: "SCANNING",
      scanAttempts: record.scanAttempts,
      reasonCode: "ANTIMALWARE_SCAN_STARTED",
    });
    if (!scanning) throw new SecureFileConcurrencyError();

    const outcome = await scanWithRetry(this.scanner, {
      fileId: scanning.id,
      originalName: scanning.originalName,
      contentType: scanning.detectedContentType,
      sha256: scanning.sha256,
      bytes,
    }, this.retryPolicy);

    if (outcome.status === "CLEAN") {
      const approvedObjectKey = approvedKey(scanning);
      await this.objectStore.promote({
        quarantineObjectKey: scanning.quarantineObjectKey,
        approvedObjectKey,
        expectedSha256: scanning.sha256,
      });
      return this.completeTransition(scanning, "APPROVED", outcome.attempts, approvedObjectKey, "ANTIMALWARE_CLEAN");
    }
    if (outcome.status === "INFECTED") {
      return this.completeTransition(scanning, "REJECTED", outcome.attempts, null, "ANTIMALWARE_INFECTED");
    }
    return this.completeTransition(scanning, "ERROR", outcome.attempts, null, outcome.errorCode);
  }

  private async completeTransition(
    scanning: SecureFileRecord,
    to: "APPROVED" | "REJECTED" | "ERROR",
    attempts: number,
    approvedObjectKey: string | null,
    reasonCode: string,
  ) {
    assertSecureFileTransition(scanning.state, to);
    const completed = await this.repository.transition({
      id: scanning.id,
      expectedVersion: scanning.version,
      from: "SCANNING",
      to,
      scanAttempts: scanning.scanAttempts + attempts,
      approvedObjectKey,
      reasonCode,
    });
    if (!completed) throw new SecureFileConcurrencyError();
    return completed;
  }
}

function approvedKey(record: SecureFileRecord) {
  return `approved/${record.purpose}/${record.id}`;
}

function classifyScanError(
  error: unknown,
  timedOut: boolean,
): ScanErrorOutcome["errorCode"] {
  if (timedOut || error instanceof ScanTimeoutError) return "SCANNER_TIMEOUT";
  if (error instanceof AntimalwareUnavailableError) return "SCANNER_UNAVAILABLE";
  if (error instanceof AntimalwareProtocolError) return "SCANNER_ERROR";
  return "SCANNER_ERROR";
}

function validateRetryPolicy(policy: ScanRetryPolicy) {
  if (
    !Number.isInteger(policy.maximumAttempts)
    || policy.maximumAttempts < 1
    || policy.maximumAttempts > 10
    || !Number.isFinite(policy.timeoutMilliseconds)
    || policy.timeoutMilliseconds < 10
    || policy.timeoutMilliseconds > 120_000
    || !Number.isFinite(policy.baseDelayMilliseconds)
    || policy.baseDelayMilliseconds < 0
    || policy.baseDelayMilliseconds > 30_000
  ) {
    throw new Error("Política de retry antimalware inválida.");
  }
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
