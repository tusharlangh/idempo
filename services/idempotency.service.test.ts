import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  acquireIdempotencyKey,
  markIdempotencyKey,
} from "./idempotency.service.ts";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSelectEq = vi.fn();
const mockSelectSingle = vi.fn();

vi.mock("../utils/supabase/client.ts", () => ({
  default: {
    from: vi.fn(() => ({
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
    })),
  },
}));

function setupInsertResult(data: any, error: any) {
  mockInsert.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data, error }),
    }),
  });
}

function setupSelectResult(data: any) {
  mockSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data, error: null }),
    }),
  });
}

function setupUpdateResult(error: any) {
  mockUpdate.mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error }),
  });
}

describe("acquireIdempotencyKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns PROCEED when key is new", async () => {
    setupInsertResult({ key: "new-key", status: "PROCESSING" }, null);

    const result = await acquireIdempotencyKey("new-key", { data: "test" });

    expect(result.success).toBe(true);
    expect(result.action).toBe("PROCEED");
  });

  it("returns HASHED_MISMATCH when same key has different body", async () => {
    setupInsertResult(null, { code: "23505", message: "duplicate" });
    setupSelectResult({
      key: "existing-key",
      request_hash: "different-hash",
      status: "PROCESSING",
      locked_at: new Date().toISOString(),
    });

    const result = await acquireIdempotencyKey("existing-key", {
      data: "different",
    });

    expect(result.success).toBe(false);
    expect(result.action).toBe("HASHED_MISMATCH");
  });

  it("returns RETURN_CACHED when key is already processed", async () => {
    const { hashRequestBody } = await import("../utils/hash.ts");
    const body = { data: "test" };
    const hash = hashRequestBody(body);

    setupInsertResult(null, { code: "23505", message: "duplicate" });
    setupSelectResult({
      key: "processed-key",
      request_hash: hash,
      status: "PROCESSED",
      response_status: 202,
      response_body: { success: true, action: "processed" },
    });

    const result = await acquireIdempotencyKey("processed-key", body);

    expect(result.success).toBe(false);
    expect(result.action).toBe("RETURN_CACHED");
    expect(result.metadata?.response_status).toBe(202);
    expect(result.metadata?.response_body).toEqual({
      success: true,
      action: "processed",
    });
  });

  it("returns FAILED when key previously failed", async () => {
    const { hashRequestBody } = await import("../utils/hash.ts");
    const body = { data: "test" };
    const hash = hashRequestBody(body);

    setupInsertResult(null, { code: "23505", message: "duplicate" });
    setupSelectResult({
      key: "failed-key",
      request_hash: hash,
      status: "FAILED",
      response_status: 500,
      response_body: { success: false, action: "failed" },
    });

    const result = await acquireIdempotencyKey("failed-key", body);

    expect(result.success).toBe(false);
    expect(result.action).toBe("FAILED");
    expect(result.metadata?.response_status).toBe(500);
  });

  it("returns CONFLICT when key is still processing within lock timeout", async () => {
    const { hashRequestBody } = await import("../utils/hash.ts");
    const body = { data: "test" };
    const hash = hashRequestBody(body);

    setupInsertResult(null, { code: "23505", message: "duplicate" });
    setupSelectResult({
      key: "locked-key",
      request_hash: hash,
      status: "PROCESSING",
      locked_at: new Date().toISOString(),
    });

    const result = await acquireIdempotencyKey("locked-key", body);

    expect(result.success).toBe(false);
    expect(result.action).toBe("CONFLICT");
  });

  it("returns PROCEED when lock has expired", async () => {
    const { hashRequestBody } = await import("../utils/hash.ts");
    const body = { data: "test" };
    const hash = hashRequestBody(body);

    const expiredLock = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    setupInsertResult(null, { code: "23505", message: "duplicate" });
    setupSelectResult({
      key: "expired-key",
      request_hash: hash,
      status: "PROCESSING",
      locked_at: expiredLock,
    });
    setupUpdateResult(null);

    const result = await acquireIdempotencyKey("expired-key", body);

    expect(result.success).toBe(true);
    expect(result.action).toBe("PROCEED");
  });

  it("throws when existing key lookup returns null", async () => {
    setupInsertResult(null, { code: "23505", message: "duplicate" });
    setupSelectResult(null);

    await expect(
      acquireIdempotencyKey("ghost-key", { data: "test" }),
    ).rejects.toThrow();
  });
});

describe("markIdempotencyKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks key as PROCESSED", async () => {
    setupUpdateResult(null);

    await expect(
      markIdempotencyKey("PROCESSED", "key-123", 202, {
        action: "done",
        success: true,
      }),
    ).resolves.not.toThrow();
  });

  it("marks key as FAILED", async () => {
    setupUpdateResult(null);

    await expect(
      markIdempotencyKey("FAILED", "key-456", 500, {
        action: "error",
        success: false,
      }),
    ).resolves.not.toThrow();
  });

  it("throws when update fails", async () => {
    setupUpdateResult({ message: "update failed" });

    await expect(
      markIdempotencyKey("PROCESSED", "key-789", 200, {
        action: "done",
        success: true,
      }),
    ).rejects.toThrow("Failed to mark idempotency key as processed");
  });
});
