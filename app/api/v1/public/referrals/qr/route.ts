import QRCode from "qrcode";
import { apiUrl, signedInternalHeaders } from "../../../_session";
import { apiResponseHeaders } from "../../../_response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  if (!/^PC-[A-Z0-9]{4,16}$/.test(code)) {
    return Response.json({ error: "Código de indicação inválido." }, { status: 400 });
  }

  const path = `/api/v1/public/referrals/${encodeURIComponent(code)}`;
  try {
    const verification = await fetch(`${apiUrl()}${path}`, {
      headers: await signedInternalHeaders("GET", path, "public_referral"),
      cache: "no-store",
    });
    if (!verification.ok) {
      return Response.json(
        { error: "Convite de parceiro indisponível." },
        { status: verification.status, headers: apiResponseHeaders(verification) },
      );
    }

    const destination = new URL("/convite", request.url);
    destination.searchParams.set("codigo", code);
    destination.searchParams.set("origem", "qr");
    const image = await QRCode.toBuffer(destination.toString(), {
      type: "png",
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#101511", light: "#ffffff" },
    });
    return new Response(image, {
      headers: apiResponseHeaders(verification, {
        "content-type": "image/png",
        "cache-control": "private, max-age=300",
        "content-length": String(image.byteLength),
        "x-content-type-options": "nosniff",
      }),
    });
  } catch {
    return Response.json({ error: "QR Code temporariamente indisponível." }, { status: 503 });
  }
}
