import { describe, it, expect, vi, beforeEach } from "vitest";
import { idempo } from "./idempotency.ts";
import type { Request, Response, NextFunction } from "express";

vi.mock("../services/idempotency.service.ts", () => ({
  acquireIdempotencyKey: vi.fn(),
}));

import { acquireIdempotencyKey } from "../services/idempotency.service.ts";
const mockAcquire = vi.mocked(acquireIdempotencyKey);

function createMockReq(
  headers: Record<string, string> = {},
  body: any = {},
): Request {
  return {
    header: (name: string) => headers[name],
    body,
  } as unknown as Request;
}

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("idempotency middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls next when no idempotency key is provided", async () => {
    const req = createMockReq({});
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    await idempo(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockAcquire).not.toHaveBeenCalled();
  });

  it("calls next when action is PROCEED", async () => {
    const req = createMockReq({ "Idempotency-key": "key-1" }, { data: "test" });
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    mockAcquire.mockResolvedValue({ success: true, action: "PROCEED" });

    await idempo(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("returns cached response when action is RETURN_CACHED", async () => {
    const req = createMockReq({ "Idempotency-key": "key-2" }, { data: "test" });
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    mockAcquire.mockResolvedValue({
      success: false,
      action: "RETURN_CACHED",
      metadata: { response_status: 202, response_body: { cached: true } },
    });

    await idempo(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ cached: true });
  });

  it("returns 409 when action is CONFLICT", async () => {
    const req = createMockReq({ "Idempotency-key": "key-3" }, { data: "test" });
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    mockAcquire.mockResolvedValue({ success: false, action: "CONFLICT" });

    await idempo(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("returns 400 when action is HASHED_MISMATCH", async () => {
    const req = createMockReq(
      { "Idempotency-key": "key-4" },
      { data: "different" },
    );
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    mockAcquire.mockResolvedValue({
      success: false,
      action: "HASHED_MISMATCH",
    });

    await idempo(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 500 when acquireIdempotencyKey throws", async () => {
    const req = createMockReq({ "Idempotency-key": "key-5" }, { data: "test" });
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    mockAcquire.mockRejectedValue(new Error("db down"));

    await idempo(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("returns FAILED status with metadata", async () => {
    const req = createMockReq({ "Idempotency-key": "key-6" }, { data: "test" });
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    mockAcquire.mockResolvedValue({
      success: false,
      action: "FAILED",
      metadata: { response_status: 500, response_body: { error: "failed" } },
    });

    await idempo(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "failed" });
  });
});
