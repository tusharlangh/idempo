import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifySignature } from "./signature.ts";

describe("verifySignature", () => {
  const secret = "test-secret";

  function createSignature(body: Buffer, secretKey: string): string {
    return crypto.createHmac("sha256", secretKey).update(body).digest("hex");
  }

  it("returns true for valid signature", () => {
    const body = Buffer.from(JSON.stringify({ test: "data" }));
    const signature = createSignature(body, secret);

    expect(verifySignature(body, signature, secret)).toBe(true);
  });

  it("returns false for invalid signature", () => {
    const body = Buffer.from(JSON.stringify({ test: "data" }));
    const invalidSignature = "a".repeat(64);

    expect(verifySignature(body, invalidSignature, secret)).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const body = Buffer.from(JSON.stringify({ test: "data" }));
    const signature = createSignature(body, secret);

    expect(verifySignature(body, signature, "wrong-secret")).toBe(false);
  });

  it("returns false for tampered body", () => {
    const originalBody = Buffer.from(JSON.stringify({ test: "data" }));
    const signature = createSignature(originalBody, secret);
    const tamperedBody = Buffer.from(JSON.stringify({ test: "hacked" }));

    expect(verifySignature(tamperedBody, signature, secret)).toBe(false);
  });

  it("handles empty body", () => {
    const body = Buffer.from("");
    const signature = createSignature(body, secret);

    expect(verifySignature(body, signature, secret)).toBe(true);
  });

  it("handles large body", () => {
    const largeData = { data: "x".repeat(10000) };
    const body = Buffer.from(JSON.stringify(largeData));
    const signature = createSignature(body, secret);

    expect(verifySignature(body, signature, secret)).toBe(true);
  });

  it("rejects signature with wrong length", () => {
    const body = Buffer.from(JSON.stringify({ test: "data" }));
    const shortSignature = "abc123";

    expect(() => verifySignature(body, shortSignature, secret)).toThrow();
  });
});
