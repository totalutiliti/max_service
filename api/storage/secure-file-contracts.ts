export const secureFileStates = [
  "RECEIVED",
  "QUARANTINED",
  "SCANNING",
  "APPROVED",
  "REJECTED",
  "ERROR",
  "EXPIRED",
] as const;

export type SecureFileState = typeof secureFileStates[number];

export const secureFilePurposes = [
  "provider_document",
  "service_request_image",
  "message_image",
  "partner_support_attachment",
] as const;

export type SecureFilePurpose = typeof secureFilePurposes[number];

export interface SecureFileCandidate {
  id: string;
  purpose: SecureFilePurpose;
  originalName: string;
  declaredContentType: string;
  bytes: Buffer;
}

export interface ValidatedSecureFile {
  id: string;
  purpose: SecureFilePurpose;
  originalName: string;
  declaredContentType: string;
  detectedContentType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
  sha256: string;
  bytes: Buffer;
}

export interface SecureFileRecord {
  id: string;
  purpose: SecureFilePurpose;
  state: SecureFileState;
  version: number;
  quarantineObjectKey: string;
  approvedObjectKey: string | null;
  originalName: string;
  declaredContentType: string;
  detectedContentType: string;
  sizeBytes: number;
  sha256: string;
  scanAttempts: number;
  retentionUntil: Date | null;
  expiresAt: Date | null;
  legalHold: boolean;
}

export interface SecureFileTransitionInput {
  id: string;
  expectedVersion: number;
  from: SecureFileState;
  to: SecureFileState;
  scanAttempts?: number;
  approvedObjectKey?: string | null;
  reasonCode: string;
}

export interface SecureFileRepository {
  get(id: string): Promise<SecureFileRecord | null>;
  transition(input: SecureFileTransitionInput): Promise<SecureFileRecord | null>;
}

export interface SecureFileObjectStore {
  promote(input: {
    quarantineObjectKey: string;
    approvedObjectKey: string;
    expectedSha256: string;
  }): Promise<void>;
  remove(objectKey: string): Promise<void>;
}

export interface AntimalwareScanInput {
  fileId: string;
  originalName: string;
  contentType: string;
  sha256: string;
  bytes: Buffer;
}

export interface AntimalwareCleanVerdict {
  status: "CLEAN";
  engine: string;
  engineVersion: string | null;
  definitionsVersion: string | null;
}

export interface AntimalwareInfectedVerdict {
  status: "INFECTED";
  engine: string;
  engineVersion: string | null;
  definitionsVersion: string | null;
  signature: string;
}

export type AntimalwareVerdict = AntimalwareCleanVerdict | AntimalwareInfectedVerdict;

export interface AntimalwareScanner {
  scan(input: AntimalwareScanInput, signal: AbortSignal): Promise<AntimalwareVerdict>;
}

export interface ScanRetryPolicy {
  maximumAttempts: number;
  timeoutMilliseconds: number;
  baseDelayMilliseconds: number;
}

export type SecureFileScanOutcome =
  | {
      status: "CLEAN";
      attempts: number;
      verdict: AntimalwareCleanVerdict;
    }
  | {
      status: "INFECTED";
      attempts: number;
      verdict: AntimalwareInfectedVerdict;
    }
  | {
      status: "ERROR";
      attempts: number;
      errorCode: "SCANNER_TIMEOUT" | "SCANNER_UNAVAILABLE" | "SCANNER_ERROR";
    };

export interface IdempotencyClaim {
  key: string;
  requestHash: string;
  leaseId: string;
}

export type IdempotencyBeginResult<T> =
  | { status: "STARTED"; claim: IdempotencyClaim }
  | { status: "REPLAY"; response: T }
  | { status: "IN_PROGRESS" }
  | { status: "CONFLICT" };

export interface SecureFileIdempotencyStore<T> {
  begin(key: string, requestHash: string): Promise<IdempotencyBeginResult<T>>;
  complete(claim: IdempotencyClaim, response: T): Promise<void>;
  release(claim: IdempotencyClaim): Promise<void>;
}
