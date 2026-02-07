import { it, describe, vi, expect } from "vitest";
import { Retry } from "./retry.ts";

describe("check retry on valid functions", () => {
  it("returns true", async () => {
    const retry = new Retry();
    const mockedFn = vi.fn().mockResolvedValue("success");

    const { result, error_details } = await retry.retry(mockedFn, 3);

    expect(result).toBe("success");
    expect(error_details.flag).toBe("SUCCESS");
    expect(mockedFn).toHaveBeenCalledTimes(1);
  });

  it("should fail but suceed after retries", async () => {
    const retry = new Retry();
    const mockedFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail #1"))
      .mockRejectedValueOnce(new Error("fail #2"))
      .mockResolvedValue("success");

    const { result, error_details } = await retry.retry(mockedFn, 3);

    expect(result).toBe("success");
    expect(error_details.flag).toBe("SUCCESS");
    expect(mockedFn).toHaveBeenCalledTimes(3);
  });

  it("should fail for all ", async () => {
    const retry = new Retry();
    const mockedFn = vi.fn().mockRejectedValue(new Error("Complete failure"));

    const { result, error_details } = await retry.retry(mockedFn, 3);

    expect(result).toBeUndefined();
    expect(error_details.flag).toBe("FAILURE");
    expect(error_details.retry_attempts).toHaveLength(4);
    expect(mockedFn).toHaveBeenCalledTimes(4);
  });

  it("should record error details for each attempt", async () => {
    const retry = new Retry();
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("error 1"))
      .mockRejectedValueOnce(new Error("error 2"))
      .mockResolvedValue("success");
    const { error_details } = await retry.retry(mockFn, 3);
    expect(error_details.retry_attempts).toHaveLength(2);
    expect(error_details.retry_attempts[0]!.error).toBe("error 1");
    expect(error_details.retry_attempts[1]!.error).toBe("error 2");
  });
});
