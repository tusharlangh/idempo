import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  logDeliveryAttempt,
  getDeliveryAttempts,
} from "./deliveryLogger.service.ts";

const mockInsert = vi.fn();
const mockSelectEq = vi.fn();
const mockOrder = vi.fn();

vi.mock("../utils/supabase/client.ts", () => ({
  default: {
    from: vi.fn((table: string) => {
      if (table === "delivery_attempts") {
        return {
          insert: mockInsert,
          select: vi.fn().mockReturnValue({
            eq: mockSelectEq,
          }),
        };
      }
    }),
  },
}));

describe("logDeliveryAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a successful delivery attempt", async () => {
    mockInsert.mockResolvedValue({ error: null });

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
    mockInsert.mockResolvedValue({ error: null });

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
    mockInsert.mockResolvedValue({
      error: { message: "insert failed" },
    });

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
    let insertedData: any;

    mockInsert.mockImplementation((data: any) => {
      insertedData = data;
      return Promise.resolve({ error: null });
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

    expect(insertedData.latency_ms).toBeGreaterThanOrEqual(100);
  });

  it("truncates response body to 1000 characters", async () => {
    let insertedData: any;

    mockInsert.mockImplementation((data: any) => {
      insertedData = data;
      return Promise.resolve({ error: null });
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

    expect(insertedData.response_body.length).toBe(1000);
  });

  it("handles null optional fields", async () => {
    let insertedData: any;

    mockInsert.mockImplementation((data: any) => {
      insertedData = data;
      return Promise.resolve({ error: null });
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

    expect(insertedData.status_code).toBeNull();
    expect(insertedData.response_body).toBeNull();
    expect(insertedData.error_message).toBeNull();
  });
});

describe("getDeliveryAttempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns delivery attempts for an event", async () => {
    mockSelectEq.mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [
          { id: "da-1", attempt_number: 1, success: false },
          { id: "da-2", attempt_number: 2, success: true },
        ],
        error: null,
      }),
    });

    const attempts = await getDeliveryAttempts("evt-123");

    expect(attempts).toHaveLength(2);
    expect(attempts[0].attempt_number).toBe(1);
    expect(attempts[1].attempt_number).toBe(2);
  });

  it("returns empty array on error", async () => {
    mockSelectEq.mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "query failed" },
      }),
    });

    const attempts = await getDeliveryAttempts("evt-error");

    expect(attempts).toEqual([]);
  });

  it("returns empty array when no attempts exist", async () => {
    mockSelectEq.mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    });

    const attempts = await getDeliveryAttempts("evt-none");

    expect(attempts).toEqual([]);
  });
});
