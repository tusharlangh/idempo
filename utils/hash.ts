import crypto from "crypto";

export function hashRequestBody(body: any) {
  return crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
}
