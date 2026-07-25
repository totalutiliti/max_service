import type { SecureFileState } from "./secure-file-contracts.js";

const transitions: Readonly<Record<SecureFileState, ReadonlySet<SecureFileState>>> = {
  RECEIVED: new Set(["QUARANTINED", "REJECTED", "ERROR", "EXPIRED"]),
  QUARANTINED: new Set(["SCANNING", "ERROR", "EXPIRED"]),
  SCANNING: new Set(["APPROVED", "REJECTED", "ERROR"]),
  APPROVED: new Set(["EXPIRED"]),
  REJECTED: new Set(["EXPIRED"]),
  ERROR: new Set(["QUARANTINED", "EXPIRED"]),
  EXPIRED: new Set(),
};

export class InvalidSecureFileTransitionError extends Error {
  constructor(from: SecureFileState, to: SecureFileState) {
    super(`Transição de arquivo privado inválida: ${from} -> ${to}.`);
    this.name = "InvalidSecureFileTransitionError";
  }
}

export function canTransitionSecureFile(from: SecureFileState, to: SecureFileState) {
  return transitions[from].has(to);
}

export function assertSecureFileTransition(from: SecureFileState, to: SecureFileState) {
  if (!canTransitionSecureFile(from, to)) {
    throw new InvalidSecureFileTransitionError(from, to);
  }
}
