import { resolve } from "node:path";
import { startProdServer } from "vinext/server/prod-server";

const port = Number(process.env.PORT ?? 4174);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT deve ser um inteiro entre 1 e 65535.");
}

await startProdServer({
  port,
  host: process.env.HOST ?? "0.0.0.0",
  outDir: resolve(process.cwd(), "dist"),
});
