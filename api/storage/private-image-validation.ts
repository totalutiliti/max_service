import { BadRequestException } from "@nestjs/common";

export const maximumPrivateImageBytes = 524_288;

export function validatePrivateImage(originalName: string, contentType: string, bytes: Buffer) {
  if (bytes.length < 8 || bytes.length > maximumPrivateImageBytes) {
    throw new BadRequestException("A imagem deve ter entre 8 bytes e 512 KB.");
  }
  const name = originalName.replace(/\\/g, "/").split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  if (!name || name.length > 120) throw new BadRequestException("Nome de arquivo inválido.");
  const extension = name.toLowerCase().split(".").pop();
  const valid = contentType === "image/jpeg"
    ? (extension === "jpg" || extension === "jpeg") && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : contentType === "image/png"
      ? extension === "png" && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : false;
  if (!valid) throw new BadRequestException("Tipo, extensão ou assinatura da imagem não permitidos.");
  return name;
}
