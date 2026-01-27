import crypto from "crypto";

export function verifySignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const sigBuffer = Buffer.from(signature, "hex");
  const computedBuffer = Buffer.from(computed, "hex");

  return crypto.timingSafeEqual(sigBuffer, computedBuffer);
}
