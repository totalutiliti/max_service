import { PayloadTooLargeException } from "@nestjs/common";
import type { IncomingMessage } from "node:http";

export interface HeaderResponse {
  setHeader(name: string, value: string | number): void;
}

export function decodeFileName(value: string | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export async function readLimitedBody(request: IncomingMessage, maximumBytes: number, message: string) {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new PayloadTooLargeException(message);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maximumBytes) throw new PayloadTooLargeException(message);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

export function setPrivateFileHeaders(
  response: HeaderResponse,
  fileName: string,
  contentType: string,
  size: number,
  disposition: "attachment" | "inline" = "attachment",
) {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  response.setHeader("content-type", contentType);
  response.setHeader("content-length", size);
  response.setHeader("content-disposition", `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("x-content-type-options", "nosniff");
}
