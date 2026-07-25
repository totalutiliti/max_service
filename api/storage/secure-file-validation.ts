import { createHash } from "node:crypto";
import type {
  SecureFileCandidate,
  SecureFilePurpose,
  ValidatedSecureFile,
} from "./secure-file-contracts.js";

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const forbiddenPdfTokens = [
  "/JavaScript",
  "/JS",
  "/Launch",
  "/EmbeddedFile",
  "/RichMedia",
  "/OpenAction",
  "/AA",
  "/Encrypt",
] as const;

interface SecureFileValidationPolicy {
  maximumBytes: number;
  allowedContentTypes: readonly ValidatedSecureFile["detectedContentType"][];
}

const policies: Readonly<Record<SecureFilePurpose, SecureFileValidationPolicy>> = {
  provider_document: {
    maximumBytes: 2_097_152,
    allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
  service_request_image: {
    maximumBytes: 524_288,
    allowedContentTypes: ["image/jpeg", "image/png"],
  },
  message_image: {
    maximumBytes: 524_288,
    allowedContentTypes: ["image/jpeg", "image/png"],
  },
  partner_support_attachment: {
    maximumBytes: 2_097_152,
    allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
};

const extensions: Readonly<Record<ValidatedSecureFile["detectedContentType"], ReadonlySet<string>>> = {
  "application/pdf": new Set(["pdf"]),
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/png": new Set(["png"]),
};

export type SecureFileValidationErrorCode =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "INVALID_FILE_NAME"
  | "TYPE_NOT_ALLOWED"
  | "TYPE_MISMATCH"
  | "MALFORMED_FILE"
  | "ACTIVE_PDF_CONTENT"
  | "IMAGE_DIMENSIONS_EXCEEDED";

export class SecureFileValidationError extends Error {
  constructor(
    readonly code: SecureFileValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SecureFileValidationError";
  }
}

export function validateSecureFile(candidate: SecureFileCandidate): ValidatedSecureFile {
  const policy = policies[candidate.purpose];
  if (candidate.bytes.length === 0) {
    throw new SecureFileValidationError("EMPTY_FILE", "O arquivo está vazio.");
  }
  if (candidate.bytes.length > policy.maximumBytes) {
    throw new SecureFileValidationError("FILE_TOO_LARGE", "O arquivo excede o limite da finalidade.");
  }

  const originalName = normalizeFileName(candidate.originalName);
  const declaredContentType = normalizeContentType(candidate.declaredContentType);
  if (!policy.allowedContentTypes.includes(declaredContentType)) {
    throw new SecureFileValidationError("TYPE_NOT_ALLOWED", "O tipo declarado não é permitido para esta finalidade.");
  }

  const detectedContentType = detectAndValidateContent(candidate.bytes);
  const extension = originalName.toLowerCase().split(".").pop() ?? "";
  if (
    detectedContentType !== declaredContentType
    || !extensions[detectedContentType].has(extension)
  ) {
    throw new SecureFileValidationError(
      "TYPE_MISMATCH",
      "MIME declarado, extensão e conteúdo detectado não correspondem.",
    );
  }

  return {
    id: candidate.id,
    purpose: candidate.purpose,
    originalName,
    declaredContentType,
    detectedContentType,
    sizeBytes: candidate.bytes.length,
    sha256: createHash("sha256").update(candidate.bytes).digest("hex"),
    bytes: candidate.bytes,
  };
}

function normalizeFileName(value: string) {
  const normalized = value.normalize("NFC").replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (
    normalized.length < 1
    || normalized.length > 120
    || normalized === "."
    || normalized === ".."
    || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(normalized)
    || normalized.startsWith(".")
    || normalized.endsWith(".")
  ) {
    throw new SecureFileValidationError("INVALID_FILE_NAME", "Nome de arquivo inválido.");
  }
  return normalized;
}

function normalizeContentType(value: string): ValidatedSecureFile["detectedContentType"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "application/pdf" || normalized === "image/jpeg" || normalized === "image/png") {
    return normalized;
  }
  throw new SecureFileValidationError("TYPE_NOT_ALLOWED", "MIME declarado não permitido.");
}

function detectAndValidateContent(bytes: Buffer): ValidatedSecureFile["detectedContentType"] {
  if (bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    validatePng(bytes);
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    validateJpeg(bytes);
    return "image/jpeg";
  }
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    validatePdf(bytes);
    return "application/pdf";
  }
  throw new SecureFileValidationError("MALFORMED_FILE", "Assinatura binária desconhecida ou inválida.");
}

function validatePdf(bytes: Buffer) {
  const source = bytes.toString("latin1");
  if (!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r?\n|\r)/.test(source)) {
    throw new SecureFileValidationError("MALFORMED_FILE", "Cabeçalho PDF inválido.");
  }
  const eofIndex = source.lastIndexOf("%%EOF");
  if (eofIndex < 0 || !/^[\s]*$/.test(source.slice(eofIndex + 5))) {
    throw new SecureFileValidationError("MALFORMED_FILE", "Marcador final PDF ausente ou conteúdo residual detectado.");
  }
  const tailStart = Math.max(0, eofIndex - 1_024);
  if (!source.slice(tailStart, eofIndex).includes("startxref")) {
    throw new SecureFileValidationError("MALFORMED_FILE", "Tabela de referências PDF não encontrada.");
  }
  const folded = source.toLowerCase();
  const forbidden = forbiddenPdfTokens.find((token) => {
    const expression = new RegExp(`${escapeRegularExpression(token)}(?=\\s|\\[|<|/|$)`, "i");
    return expression.test(folded);
  });
  if (forbidden) {
    throw new SecureFileValidationError("ACTIVE_PDF_CONTENT", `Recurso ativo PDF proibido: ${forbidden}.`);
  }
}

function validatePng(bytes: Buffer) {
  let offset = pngSignature.length;
  let hasHeader = false;
  let hasData = false;
  let hasEnd = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      throw new SecureFileValidationError("MALFORMED_FILE", "Chunk PNG truncado.");
    }
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    if (length > 16_777_216 || crcOffset + 4 > bytes.length) {
      throw new SecureFileValidationError("MALFORMED_FILE", "Tamanho de chunk PNG inválido.");
    }
    const type = bytes.subarray(typeStart, dataStart).toString("ascii");
    const expectedCrc = bytes.readUInt32BE(crcOffset);
    const actualCrc = crc32(bytes.subarray(typeStart, dataEnd));
    if (expectedCrc !== actualCrc) {
      throw new SecureFileValidationError("MALFORMED_FILE", "CRC de chunk PNG inválido.");
    }

    if (!hasHeader) {
      if (type !== "IHDR" || length !== 13) {
        throw new SecureFileValidationError("MALFORMED_FILE", "IHDR deve ser o primeiro chunk PNG.");
      }
      const width = bytes.readUInt32BE(dataStart);
      const height = bytes.readUInt32BE(dataStart + 4);
      const bitDepth = bytes[dataStart + 8];
      const colorType = bytes[dataStart + 9];
      const compression = bytes[dataStart + 10];
      const filter = bytes[dataStart + 11];
      const interlace = bytes[dataStart + 12];
      if (
        width < 1
        || height < 1
        || width > 12_000
        || height > 12_000
        || width * height > 20_000_000
      ) {
        throw new SecureFileValidationError("IMAGE_DIMENSIONS_EXCEEDED", "Dimensões PNG excedem a política.");
      }
      if (
        !validPngBitDepth(bitDepth, colorType)
        || compression !== 0
        || filter !== 0
        || (interlace !== 0 && interlace !== 1)
      ) {
        throw new SecureFileValidationError("MALFORMED_FILE", "Parâmetros IHDR não suportados.");
      }
      hasHeader = true;
    } else if (type === "IHDR") {
      throw new SecureFileValidationError("MALFORMED_FILE", "PNG contém mais de um IHDR.");
    }

    if (type === "IDAT") hasData = true;
    if (type === "IEND") {
      if (length !== 0 || crcOffset + 4 !== bytes.length) {
        throw new SecureFileValidationError("MALFORMED_FILE", "IEND inválido ou conteúdo residual no PNG.");
      }
      hasEnd = true;
      break;
    }
    offset = crcOffset + 4;
  }

  if (!hasHeader || !hasData || !hasEnd) {
    throw new SecureFileValidationError("MALFORMED_FILE", "Estrutura PNG incompleta.");
  }
}

function validateJpeg(bytes: Buffer) {
  if (bytes.length < 8 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new SecureFileValidationError("MALFORMED_FILE", "Cabeçalho JPEG inválido.");
  }
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new SecureFileValidationError("MALFORMED_FILE", "JPEG truncado ou com conteúdo residual.");
  }

  let offset = 2;
  let dimensionsFound = false;
  while (offset < bytes.length - 2) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0x00) {
      throw new SecureFileValidationError("MALFORMED_FILE", "Marcador JPEG inválido.");
    }
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      if (!dimensionsFound) {
        throw new SecureFileValidationError("MALFORMED_FILE", "JPEG sem quadro de dimensões.");
      }
      return;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length - 2) {
      throw new SecureFileValidationError("MALFORMED_FILE", "Segmento JPEG truncado.");
    }
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length - 2) {
      throw new SecureFileValidationError("MALFORMED_FILE", "Tamanho de segmento JPEG inválido.");
    }
    if (isStartOfFrame(marker)) {
      if (length < 8) {
        throw new SecureFileValidationError("MALFORMED_FILE", "Quadro JPEG inválido.");
      }
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width < 1 || height < 1 || width * height > 20_000_000) {
        throw new SecureFileValidationError("IMAGE_DIMENSIONS_EXCEEDED", "Dimensões JPEG excedem a política.");
      }
      dimensionsFound = true;
    }
    offset += length;
  }
  if (!dimensionsFound) {
    throw new SecureFileValidationError("MALFORMED_FILE", "JPEG sem quadro de dimensões.");
  }
}

function isStartOfFrame(marker: number) {
  return (
    marker >= 0xc0
    && marker <= 0xcf
    && marker !== 0xc4
    && marker !== 0xc8
    && marker !== 0xcc
  );
}

function validPngBitDepth(bitDepth: number, colorType: number) {
  const allowed: Readonly<Record<number, readonly number[]>> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  return allowed[colorType]?.includes(bitDepth) === true;
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
