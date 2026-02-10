import { describe, it, expect, vi, beforeEach } from "vitest";
import { moveToDeadLetter, getPendingDLQEvents } from "./dlq.service.ts";

const mockQuery = vi.fn();

vi.mock("../db/pool.ts", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

describe("DLQ Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should move event to dead letter queue", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "dlq-123", status: "PENDING" }],
    });

    const result = await moveToDeadLetter(
      "event-123",
      "idem-key-456",
      { type: "test.event" },
      { flag: "FAILURE", retry_attempts: [] },
    );

    expect(result).toBeDefined();
    expect(result.id).toBe("dlq-123");
  });

  it("should get pending DLQ events", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "dlq-1" }, { id: "dlq-2" }],
    });

    const events = await getPendingDLQEvents();

    expect(events).toHaveLength(2);
  });
});
