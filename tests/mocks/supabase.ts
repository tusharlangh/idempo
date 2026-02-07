import { vi } from "vitest";

export const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 1 }, error: null })),
      })),
    })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
  rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
};

vi.mock("../utils/supabase/client", () => ({
  default: mockSupabase,
}));
