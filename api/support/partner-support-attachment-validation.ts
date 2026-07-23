import { BadRequestException } from "@nestjs/common";

export const maximumPartnerSupportAttachmentBytes = 2_097_152;

export function validatePartnerSupportAttachment(
  originalName: string,
  contentType: string,
  bytes: Buffer,
) {
  if (bytes.length < 4 || bytes.length > maximumPartnerSupportAttachmentBytes) {
    throw new BadRequestException("O arquivo deve ter entre 4 bytes e 2 MB.");
  }
  const name = originalName
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim() ?? "";
  if (!name || name.length > 120) {
    throw new BadRequestException("Nome de arquivo inválido.");
  }

  const extension = name.toLowerCase().split(".").pop();
  const valid = contentType === "application/pdf"
    ? extension === "pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-"
    : contentType === "image/jpeg"
      ? (extension === "jpg" || extension === "jpeg")
        && bytes[0] === 0xff
        && bytes[1] === 0xd8
        && bytes[2] === 0xff
      : contentType === "image/png"
        ? extension === "png"
          && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : false;
  if (!valid) {
    throw new BadRequestException("Tipo, extensão ou assinatura do arquivo não permitidos.");
  }
  return name;
}
