import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../server.ts";

describe("webhook", () => {
  it("webhook should reject with no signature", async () => {
    const response = await request(app)
      .post("/webhooks")
      .set("Content-Type", "application/json")
      .send({ test: 0 });

    expect(response.status).toBe(404);
  });

  it("webhook should not accept given wrong signature", async () => {
    const response = await request(app)
      .post("/webhooks")
      .set("Content-Type", "application/json")
      .set(
        "x-webhook-signature",
        "debd6cf821fafdf6ea43f957c4316d2856bf33306e237bf66540e3afa75e6595",
      )
      .set("Idempotency-key", "testing-idempo-key")
      .send({ test: 1 });

    expect(response.status).toBe(403);
  });

  it("webhook should accept given correct signature", async () => {
    const response = await request(app)
      .post("/webhooks")
      .set(
        "x-webhook-signature",
        "cebd6cf821fafdf6ea43f957c4316d2856bf33306e237bf66540e3afa75e6584",
      )
      .set("Idempotency-key", "123466rwgg")
      .send({ test: 1 });

    expect(response.status).toBe(202);
  });
});
