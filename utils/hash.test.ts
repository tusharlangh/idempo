import { describe, it, expect } from "vitest";
import { hashRequestBody } from "./hash.ts";

describe("hashRequestBody", () => {
  it("return same for same input", () => {
    const body = { id: 1, name: "test" };

    const hash1 = hashRequestBody(body);
    const hash2 = hashRequestBody(body);

    expect(hash1).toBe(hash2);
  });

  it("return different hash for different input", () => {
    const body1 = { id: 1 };
    const body2 = { id: 2 };

    const hash1 = hashRequestBody(body1);
    const hash2 = hashRequestBody(body2);

    expect(hash1).not.toBe(hash2);
  });

  it("handle nested objects/dict", () => {
    const body = { data: { nested: { deep: "value" } } };

    const hash = hashRequestBody(body);

    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
  });
});
