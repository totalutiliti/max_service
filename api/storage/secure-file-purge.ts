import type {
  SecureFileObjectStore,
  SecureFileRecord,
  SecureFileRepository,
} from "./secure-file-contracts.js";
import { assertSecureFileTransition } from "./secure-file-state-machine.js";
import { SecureFileConcurrencyError } from "./secure-file-scan.js";

export type SecureFilePurgeEligibility =
  | { eligible: true; reasonCode: "RETENTION_ELAPSED" | "UPLOAD_EXPIRED" }
  | {
      eligible: false;
      reasonCode:
        | "LEGAL_HOLD"
        | "RETENTION_NOT_ELAPSED"
        | "UPLOAD_NOT_EXPIRED"
        | "SCAN_IN_PROGRESS";
    };

export function secureFilePurgeEligibility(record: SecureFileRecord, now: Date): SecureFilePurgeEligibility {
  if (record.legalHold) return { eligible: false, reasonCode: "LEGAL_HOLD" };
  if (record.state === "SCANNING") return { eligible: false, reasonCode: "SCAN_IN_PROGRESS" };
  if (record.state === "RECEIVED" || record.state === "QUARANTINED" || record.state === "ERROR") {
    return record.expiresAt && record.expiresAt.getTime() <= now.getTime()
      ? { eligible: true, reasonCode: "UPLOAD_EXPIRED" }
      : { eligible: false, reasonCode: "UPLOAD_NOT_EXPIRED" };
  }
  return record.retentionUntil && record.retentionUntil.getTime() <= now.getTime()
    ? { eligible: true, reasonCode: "RETENTION_ELAPSED" }
    : { eligible: false, reasonCode: "RETENTION_NOT_ELAPSED" };
}

export class SecureFilePurgeService {
  constructor(
    private readonly repository: SecureFileRepository,
    private readonly objectStore: SecureFileObjectStore,
  ) {}

  async purge(record: SecureFileRecord, now = new Date()) {
    if (record.state === "EXPIRED") {
      await this.removeKnownObjects(record);
      return { record, replayed: true };
    }
    const eligibility = secureFilePurgeEligibility(record, now);
    if (!eligibility.eligible) return { record, replayed: false, blockedBy: eligibility.reasonCode };

    assertSecureFileTransition(record.state, "EXPIRED");
    const expired = await this.repository.transition({
      id: record.id,
      expectedVersion: record.version,
      from: record.state,
      to: "EXPIRED",
      reasonCode: eligibility.reasonCode,
    });
    if (!expired) throw new SecureFileConcurrencyError();
    await this.removeKnownObjects(expired);
    return { record: expired, replayed: false };
  }

  private async removeKnownObjects(record: SecureFileRecord) {
    const keys = new Set([
      record.quarantineObjectKey,
      record.approvedObjectKey,
    ].filter((key): key is string => Boolean(key)));
    for (const key of keys) await this.objectStore.remove(key);
  }
}
