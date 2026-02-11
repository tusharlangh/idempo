import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  logDeliveryAttempt,
  getDeliveryAttempts,
} from "./deliveryLogger.service.ts";

const mockQuery = vi.fn();

vi.mock("../db/pool.ts", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

describe("logDeliveryAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a successful delivery attempt", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    await expect(
      logDeliveryAttempt(
        {
          eventId: "evt-123",
          attemptNumber: 1,
          destinationUrl: "https://example.com/webhook",
          requestHeaders: { "Content-Type": "application/json" },
          requestBody: { type: "user.created" },
          startedAt: new Date(),
        },
        {
          statusCode: 200,
          responseBody: "OK",
          success: true,
        },
      ),
    ).resolves.not.toThrow();
  });

  it("logs a failed delivery attempt with error message", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    await expect(
      logDeliveryAttempt(
        {
          eventId: "evt-456",
          attemptNumber: 2,
          destinationUrl: "https://example.com/webhook",
          requestHeaders: { "Content-Type": "application/json" },
          requestBody: { type: "user.updated" },
          startedAt: new Date(),
        },
        {
          errorMessage: "Connection refused",
          success: false,
        },
      ),
    ).resolves.not.toThrow();
  });

  it("throws when insert fails", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    await expect(
      logDeliveryAttempt(
        {
          eventId: "evt-789",
          attemptNumber: 1,
          destinationUrl: "https://example.com/webhook",
          requestHeaders: { "Content-Type": "application/json" },
          requestBody: {},
          startedAt: new Date(),
        },
        {
          statusCode: 500,
          success: false,
        },
      ),
    ).rejects.toThrow("Failed to log delivery attempt");
  });

  it("calculates latency correctly", async () => {
    const startedAt = new Date(Date.now() - 150);
    let capturedParams: any;

    mockQuery.mockImplementation((_sql: string, params: any[]) => {
      capturedParams = params;
      return Promise.resolve({ rowCount: 1 });
    });

    await logDeliveryAttempt(
      {
        eventId: "evt-latency",
        attemptNumber: 1,
        destinationUrl: "https://example.com/webhook",
        requestHeaders: { "Content-Type": "application/json" },
        requestBody: {},
        startedAt,
      },
      { statusCode: 200, success: true },
    );

    const latencyMs = capturedParams[10];
    expect(latencyMs).toBeGreaterThanOrEqual(100);
  });

  it("truncates response body to 1000 characters", async () => {
    let capturedParams: any;

    mockQuery.mockImplementation((_sql: string, params: any[]) => {
      capturedParams = params;
      return Promise.resolve({ rowCount: 1 });
    });

    const longResponse = "x".repeat(2000);

    await logDeliveryAttempt(
      {
        eventId: "evt-truncate",
        attemptNumber: 1,
        destinationUrl: "https://example.com/webhook",
        requestHeaders: { "Content-Type": "application/json" },
        requestBody: {},
        startedAt: new Date(),
      },
      { statusCode: 200, responseBody: longResponse, success: true },
    );

    const responseBody = capturedParams[6];
    expect(responseBody.length).toBe(1000);
  });

  it("handles null optional fields", async () => {
    let capturedParams: any;

    mockQuery.mockImplementation((_sql: string, params: any[]) => {
      capturedParams = params;
      return Promise.resolve({ rowCount: 1 });
    });

    await logDeliveryAttempt(
      {
        eventId: "evt-nulls",
        attemptNumber: 1,
        destinationUrl: "https://example.com/webhook",
        requestHeaders: {},
        requestBody: {},
        startedAt: new Date(),
      },
      { success: false },
    );

    expect(capturedParams[5]).toBeNull();
    expect(capturedParams[6]).toBeNull();
    expect(capturedParams[7]).toBeNull();
  });
});

describe("getDeliveryAttempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns delivery attempts for an event", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "da-1", attempt_number: 1, success: false },
        { id: "da-2", attempt_number: 2, success: true },
      ],
    });

    const attempts = await getDeliveryAttempts("evt-123");

    expect(attempts).toHaveLength(2);
    expect(attempts[0].attempt_number).toBe(1);
    expect(attempts[1].attempt_number).toBe(2);
  });

  it("returns empty array on error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("query failed"));

    const attempts = await getDeliveryAttempts("evt-error");

    expect(attempts).toEqual([]);
  });

  it("returns empty array when no attempts exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const attempts = await getDeliveryAttempts("evt-none");

    expect(attempts).toEqual([]);
  });
});
