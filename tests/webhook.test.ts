import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../server.ts";

describe("webhook", () => {
  const validDestinationUrl = "https://httpbin.org/post";

  it("webhook should reject with no signature", async () => {
    const response = await request(app)
      .post("/webhooks")
      .set("Content-Type", "application/json")
      .set("X-Destination-URL", validDestinationUrl)
      .send({ test: 0 });

    expect(response.status).toBe(404);
  });

  it("webhook should reject with missing destination URL", async () => {
    const response = await request(app)
      .post("/webhooks")
      .set("Content-Type", "application/json")
      .set(
        "x-webhook-signature",
        "cebd6cf821fafdf6ea43f957c4316d2856bf33306e237bf66540e3afa75e6584",
      )
      .set("Idempotency-key", "testing-missing-url")
      .send({ test: 1 });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("X-Destination-URL");
  });

  it("webhook should reject with invalid destination URL", async () => {
    const response = await request(app)
      .post("/webhooks")
      .set("Content-Type", "application/json")
      .set(
        "x-webhook-signature",
        "cebd6cf821fafdf6ea43f957c4316d2856bf33306e237bf66540e3afa75e6584",
      )
      .set("Idempotency-key", "testing-invalid-url")
      .set("X-Destination-URL", "not-a-valid-url")
      .send({ test: 1 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_URL");
  });

  it("webhook should not accept given wrong signature", async () => {
    const response = await request(app)
      .post("/webhooks")
      .set("Content-Type", "application/json")
      .set(
        "x-webhook-signature",
        "debd6cf821fafdf6ea43f957c4316d2856bf33306e237bf66540e3afa75e6595",
      )
      .set("Idempotency-key", `wrong-sig-${Date.now()}`)
      .set("X-Destination-URL", validDestinationUrl)
      .send({ test: 1 });

    expect(response.status).toBe(403);
  });

  it("webhook should accept given correct signature and valid destination URL", async () => {
    const response = await request(app)
      .post("/webhooks")
      .set(
        "x-webhook-signature",
        "cebd6cf821fafdf6ea43f957c4316d2856bf33306e237bf66540e3afa75e6584",
      )
      .set("Idempotency-key", `test-${Date.now()}`)
      .set("X-Destination-URL", validDestinationUrl)
      .send({ test: 1 });

    expect(response.status).toBe(202);
  });
});
