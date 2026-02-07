import { describe, it, expect, vi, beforeEach } from "vitest";
import { moveToDeadLetter, getPendingDLQEvents } from "./dlq.service.ts";

vi.mock("../utils/supabase/client.ts", () => ({
  default: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: { id: "dlq-123", status: "PENDING" },
              error: null,
            }),
          ),
        })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: [{ id: "dlq-1" }, { id: "dlq-2" }],
              error: null,
            }),
          ),
        })),
      })),
    })),
  },
}));

describe("DLQ Service", () => {
  it("should move event to dead letter queue", async () => {
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
    const events = await getPendingDLQEvents();

    expect(events).toHaveLength(2);
  });
});
