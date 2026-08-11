import { describe, expect, it } from "vitest";
import { diffVariants, type Combination, combinationKey } from "./variant-combinations";

const combinations: Combination[] = [["b", "s"], ["b", "m"], ["w", "s"], ["w", "m"]].map((valueIds) => ({
  key: combinationKey(valueIds),
  valueIds,
  label: valueIds.join("|"),
}));

const existing = combinations.map((x) => ({
  id: `variant-${x.valueIds.join("-")}`,
  combinationKey: x.key,
}));

describe("safe variant diff contract", () => {
  // 1. rejects duplicate existing keys
  it("rejects duplicate existing keys", () =>
    expect(() =>
      diffVariants(
        [
          { id: "a", combinationKey: "x" },
          { id: "b", combinationKey: "x" },
        ],
        []
      )
    ).toThrow());

  // 2. rejects duplicate desired keys
  it("rejects duplicate desired keys", () =>
    expect(() =>
      diffVariants(
        [],
        [
          { key: "x", valueIds: [], label: "x" },
          { key: "x", valueIds: [], label: "x" },
        ]
      )
    ).toThrow());

  // 3. preserves simple no-options
  it("preserves simple no-options", () => {
    const r = diffVariants([{ id: "default", combinationKey: null }], []);
    expect(r).toMatchObject({
      keep: [{ id: "default" }],
      create: [],
      remove: [],
      transition: { type: "NONE" },
    });
  });

  // 4. surfaces simple to multi
  it("surfaces simple to multi", () =>
    expect(
      diffVariants([{ id: "default", combinationKey: null }], combinations)
        .transition
    ).toEqual({ type: "SIMPLE_TO_MULTI", defaultVariantId: "default" }));

  // 5. surfaces multi to simple
  it("surfaces multi to simple", () =>
    expect(diffVariants(existing, []).transition).toEqual({
      type: "MULTI_TO_SIMPLE",
      existingVariantIds: existing.map((x) => x.id),
    }));

  // 6. keeps normal unchanged IDs
  it("keeps normal unchanged IDs", () => {
    const r = diffVariants(existing, combinations);
    expect(r.transition.type).toBe("NONE");
    expect(r.keep.map((x) => x.id)).toEqual(existing.map((x) => x.id));
    expect(r.create).toHaveLength(0);
    expect(r.remove).toHaveLength(0);
  });

  // 7. adds values without ID churn
  it("adds values without ID churn", () => {
    const desired = [
      ...combinations,
      { key: combinationKey(["b", "l"]), valueIds: ["b", "l"], label: "b|l" },
      { key: combinationKey(["w", "l"]), valueIds: ["w", "l"], label: "w|l" },
    ];
    const r = diffVariants(existing, desired);
    expect(r.transition.type).toBe("NONE");
    expect(r.keep.map((x) => x.id)).toEqual(existing.map((x) => x.id));
    expect(r.create).toHaveLength(2);
    expect(r.remove).toHaveLength(0);
  });

  // TEST 1 — REMOVE VALUE
  it("TEST 1: remove value", () => {
    const desired = combinations.filter((c) => c.key.includes("s"));
    const r = diffVariants(existing, desired);
    
    expect(r.transition).toEqual({ type: "NONE" });
    expect(r.keep.map(x => x.id).sort()).toEqual(["variant-b-s", "variant-w-s"].sort());
    expect(r.remove.map(x => x.id).sort()).toEqual(["variant-b-m", "variant-w-m"].sort());
    expect(r.create).toHaveLength(0);
  });

  // TEST 2 — REPLACE VALUE
  it("TEST 2: replace value", () => {
    const desired = [
      combinations.find(c => c.valueIds.join("-") === "b-s")!,
      combinations.find(c => c.valueIds.join("-") === "w-s")!,
      { key: combinationKey(["b", "l"]), valueIds: ["b", "l"], label: "b|l" },
      { key: combinationKey(["w", "l"]), valueIds: ["w", "l"], label: "w|l" },
    ];
    const r = diffVariants(existing, desired);
    
    expect(r.transition).toEqual({ type: "NONE" });
    expect(r.keep.map(x => x.id).sort()).toEqual(["variant-b-s", "variant-w-s"].sort());
    expect(r.remove.map(x => x.id).sort()).toEqual(["variant-b-m", "variant-w-m"].sort());
    expect(r.create.map(x => x.key).sort()).toEqual([combinationKey(["b", "l"]), combinationKey(["w", "l"])].sort());
  });

  // TEST 3 — ADD VALUE EXACTNESS
  it("TEST 3: add-value exactness", () => {
    const desired = [
      ...combinations,
      { key: combinationKey(["b", "l"]), valueIds: ["b", "l"], label: "b|l" },
      { key: combinationKey(["w", "l"]), valueIds: ["w", "l"], label: "w|l" },
    ];
    const r = diffVariants(existing, desired);
    
    expect(r.keep.map(x => x.id).sort()).toEqual([
      "variant-b-s", "variant-b-m", "variant-w-s", "variant-w-m"
    ].sort());
    expect(r.create).toEqual([
      { key: combinationKey(["b", "l"]), valueIds: ["b", "l"], label: "b|l" },
      { key: combinationKey(["w", "l"]), valueIds: ["w", "l"], label: "w|l" },
    ]);
    expect(r.remove).toEqual([]);
  });

  // TEST 4 — OPTION GROUP REORDER
  it("TEST 4: option group reorder", () => {
    const desired: Combination[] = [
      { key: combinationKey(["s", "b"]), valueIds: ["s", "b"], label: "s|b" },
      { key: combinationKey(["m", "b"]), valueIds: ["m", "b"], label: "m|b" },
      { key: combinationKey(["s", "w"]), valueIds: ["s", "w"], label: "s|w" },
      { key: combinationKey(["m", "w"]), valueIds: ["m", "w"], label: "m|w" },
    ];
    const r = diffVariants(existing, desired);
    
    expect(r.transition).toEqual({ type: "NONE" });
    expect(r.keep.map(x => x.id).sort()).toEqual(existing.map(x => x.id).sort());
    expect(r.create).toHaveLength(0);
    expect(r.remove).toHaveLength(0);
  });

  // TEST 5 — VALUE REORDER
  it("TEST 5: value reorder", () => {
    const desired = [...combinations].reverse();
    const r = diffVariants(existing, desired);
    
    expect(r.keep.map(x => x.id).sort()).toEqual(existing.map(x => x.id).sort());
    expect(r.create).toHaveLength(0);
    expect(r.remove).toHaveLength(0);
  });

  // TEST 6 — COMBINED REORDER
  it("TEST 6: combined reorder", () => {
    const desired: Combination[] = [
      { key: combinationKey(["m", "w"]), valueIds: ["m", "w"], label: "m|w" },
      { key: combinationKey(["s", "b"]), valueIds: ["s", "b"], label: "s|b" },
      { key: combinationKey(["m", "b"]), valueIds: ["m", "b"], label: "m|b" },
      { key: combinationKey(["s", "w"]), valueIds: ["s", "w"], label: "s|w" },
    ];
    const r = diffVariants(existing, desired);
    
    expect(r.transition).toEqual({ type: "NONE" });
    expect(r.keep.map(x => x.id).sort()).toEqual(existing.map(x => x.id).sort());
    expect(r.create).toHaveLength(0);
    expect(r.remove).toHaveLength(0);
  });

  // TEST 7 — STRICT ID PRESERVATION
  it("TEST 7: strict ID preservation", () => {
    const r = diffVariants(existing, combinations);
    
    expect(r.keep.find(x => x.combinationKey === combinationKey(["b", "s"]))?.id).toBe("variant-b-s");
    expect(r.keep.find(x => x.combinationKey === combinationKey(["b", "m"]))?.id).toBe("variant-b-m");
    expect(r.keep.find(x => x.combinationKey === combinationKey(["w", "s"]))?.id).toBe("variant-w-s");
    expect(r.keep.find(x => x.combinationKey === combinationKey(["w", "m"]))?.id).toBe("variant-w-m");
  });

  // TEST 8 — CREATE SET EXACTNESS
  it("TEST 8: create set exactness", () => {
    const desired = [
      combinations.find(c => c.valueIds.join("-") === "b-s")!,
      { key: combinationKey(["b", "l"]), valueIds: ["b", "l"], label: "b|l" },
      { key: combinationKey(["w", "l"]), valueIds: ["w", "l"], label: "w|l" },
    ];
    const r = diffVariants(existing, desired);
    expect(r.create).toEqual([
      { key: combinationKey(["b", "l"]), valueIds: ["b", "l"], label: "b|l" },
      { key: combinationKey(["w", "l"]), valueIds: ["w", "l"], label: "w|l" },
    ]);
  });

  // TEST 9 — REMOVE SET EXACTNESS
  it("TEST 9: remove set exactness", () => {
    const desired = [
      combinations.find(c => c.valueIds.join("-") === "b-s")!,
      { key: combinationKey(["b", "l"]), valueIds: ["b", "l"], label: "b|l" },
      { key: combinationKey(["w", "l"]), valueIds: ["w", "l"], label: "w|l" },
    ];
    const r = diffVariants(existing, desired);
    expect(r.remove.map(x => x.id).sort()).toEqual([
      "variant-b-m",
      "variant-w-s",
      "variant-w-m"
    ].sort());
  });

  // TEST 10 — INPUT IMMUTABILITY
  it("TEST 10: input immutability", () => {
    const existingClone = JSON.parse(JSON.stringify(existing));
    const desiredClone = JSON.parse(JSON.stringify(combinations));
    
    diffVariants(existing, combinations);
    
    expect(existing).toEqual(existingClone);
    expect(combinations).toEqual(desiredClone);
  });

  // TEST 11 — DETERMINISTIC DIFF
  it("TEST 11: deterministic diff", () => {
    const desired = [
      combinations.find(c => c.valueIds.join("-") === "b-s")!,
      { key: combinationKey(["b", "l"]), valueIds: ["b", "l"], label: "b|l" },
      { key: combinationKey(["w", "l"]), valueIds: ["w", "l"], label: "w|l" },
    ];
    const run1 = diffVariants(existing, desired);
    const run2 = diffVariants(existing, desired);
    
    expect(run1).toEqual(run2);
  });

  // TEST 12 — LARGER NO-CHANGE FIXTURE
  it("TEST 12: larger no-change fixture", () => {
    const colors = ["b", "w"];
    const sizes = ["s", "m"];
    const materials = ["c", "l"];
    
    const largeCombinations: Combination[] = [];
    for (const c of colors) {
      for (const s of sizes) {
        for (const m of materials) {
          const valIds = [c, s, m];
          largeCombinations.push({
            key: combinationKey(valIds),
            valueIds: valIds,
            label: `${c}|${s}|${m}`
          });
        }
      }
    }
    
    const largeExisting = largeCombinations.map(x => ({
      id: `var-${x.key.replace(/\|/g, "-")}`,
      combinationKey: x.key
    }));
    
    const r = diffVariants(largeExisting, largeCombinations);
    
    expect(r.transition).toEqual({ type: "NONE" });
    expect(r.keep).toHaveLength(8);
    expect(r.create).toHaveLength(0);
    expect(r.remove).toHaveLength(0);
    expect(r.keep.map(x => x.id).sort()).toEqual(largeExisting.map(x => x.id).sort());
  });
});
