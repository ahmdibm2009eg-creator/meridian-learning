import { describe, it, expect } from "vitest";
import {
  selectedIds, selectedBool, textOf, valueOf, mappingOf, orderOf, valuesOf,
} from "@/lib/types";

describe("response accessors are type-safe against mismatched payloads", () => {
  it("REGRESSION (server-crash vector): null/undefined field values degrade to defaults instead of throwing", () => {
    // A payload like {"type":"MCQ_SINGLE","selected":null} previously crashed
    // scoreAnswer with "Cannot read properties of null (reading 'length')",
    // wedging the attempt in IN_PROGRESS with a 500 on every submit.
    expect(() => selectedIds({ type: "MCQ_SINGLE", selected: null } as never)).not.toThrow();
    expect(selectedIds({ type: "MCQ_SINGLE", selected: null } as never)).toEqual([]);
    expect(selectedIds({ type: "MCQ_MULTI", selected: null } as never)).toEqual([]);
    expect(selectedBool({ type: "TRUE_FALSE", selected: null } as never)).toBeNull();
    expect(textOf({ type: "SHORT_ANSWER", text: null } as never)).toBe("");
    expect(valueOf({ type: "NUMERIC", value: "not-a-number" } as never)).toBeNull();
    expect(valueOf({ type: "NUMERIC", value: Number.NaN } as never)).toBeNull();
    expect(mappingOf({ type: "MATCHING", mapping: null } as never)).toEqual({});
    expect(orderOf({ type: "ORDERING", order: null } as never)).toEqual([]);
    expect(valuesOf({ type: "FILL_BLANK", values: null } as never)).toEqual({});
  });
  it("selectedIds only reads MCQ responses", () => {
    expect(selectedIds({ type: "MCQ_SINGLE", selected: ["a", "b"] })).toEqual(["a", "b"]);
    expect(selectedIds({ type: "SHORT_ANSWER", text: "x" })).toEqual([]);
    expect(selectedIds(null)).toEqual([]);
    expect(selectedIds(undefined)).toEqual([]);
  });
  it("selectedBool only reads TRUE_FALSE responses", () => {
    expect(selectedBool({ type: "TRUE_FALSE", selected: true })).toBe(true);
    expect(selectedBool({ type: "MCQ_SINGLE", selected: ["a"] })).toBeNull();
    expect(selectedBool(null)).toBeNull();
  });
  it("textOf only reads text responses", () => {
    expect(textOf({ type: "SHORT_ANSWER", text: "hi" })).toBe("hi");
    expect(textOf({ type: "ESSAY", text: "essay" })).toBe("essay");
    expect(textOf({ type: "NUMERIC", value: 3 })).toBe("");
    expect(textOf(null)).toBe("");
  });
  it("valueOf only reads NUMERIC responses", () => {
    expect(valueOf({ type: "NUMERIC", value: 3.5 })).toBe(3.5);
    expect(valueOf({ type: "NUMERIC", value: null })).toBeNull();
    expect(valueOf({ type: "SHORT_ANSWER", text: "3" })).toBeNull();
  });
  it("mappingOf only reads MATCHING responses", () => {
    expect(mappingOf({ type: "MATCHING", mapping: { a: "b" } })).toEqual({ a: "b" });
    expect(mappingOf({ type: "ORDERING", order: [] })).toEqual({});
  });
  it("orderOf only reads ORDERING responses", () => {
    expect(orderOf({ type: "ORDERING", order: ["x", "y"] })).toEqual(["x", "y"]);
    expect(orderOf({ type: "MATCHING", mapping: {} })).toEqual([]);
  });
  it("valuesOf only reads FILL_BLANK responses", () => {
    expect(valuesOf({ type: "FILL_BLANK", values: { b1: "z" } })).toEqual({ b1: "z" });
    expect(valuesOf({ type: "ESSAY", text: "z" })).toEqual({});
  });
});
