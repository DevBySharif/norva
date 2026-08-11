export const MAX_OPTIONS = 4; export const MAX_VALUES_PER_OPTION = 20; export const MAX_COMBINATIONS = 200;
export type OptionInput = { id: string; name: string; values: { id: string; value: string }[] };
export type Combination = { key: string; valueIds: string[]; label: string };
export type VariantTransition = { type: "NONE" } | { type: "SIMPLE_TO_MULTI"; defaultVariantId: string } | { type: "MULTI_TO_SIMPLE"; existingVariantIds: string[] };
const normalize = (value: string) => value.trim().toLocaleLowerCase();
export function combinationKey(valueIds: string[]) { return [...valueIds].sort().join("|"); }
export function generateCombinations(options: OptionInput[]): Combination[] {
  if (options.length > MAX_OPTIONS) throw new Error("Too many option groups."); if (!options.length) return [];
  const names = new Set<string>(); let rows: Combination[] = [{ key: "", valueIds: [], label: "" }];
  for (const option of options) { const name = normalize(option.name); if (!name || names.has(name)) throw new Error("Option names must be unique and non-empty."); names.add(name); if (!option.values.length || option.values.length > MAX_VALUES_PER_OPTION) throw new Error("Each option needs between 1 and 20 values."); const seen = new Set<string>(); option.values.forEach(value => { const key = normalize(value.value); if (!key || seen.has(key)) throw new Error("Option values must be unique and non-empty."); seen.add(key); }); rows = rows.flatMap(row => option.values.map(value => ({ valueIds: [...row.valueIds, value.id], key: combinationKey([...row.valueIds, value.id]), label: row.label ? `${row.label} / ${value.value}` : value.value }))); if (rows.length > MAX_COMBINATIONS) throw new Error("Too many variant combinations."); }
  return rows;
}
export function diffVariants(existing: { id: string; combinationKey: string | null }[], desired: Combination[]): { keep: typeof existing; create: Combination[]; remove: typeof existing; transition: VariantTransition } {
  const defaultVariant = existing.length === 1 && existing[0].combinationKey === null ? existing[0] : null;
  if (defaultVariant && !desired.length) return { keep: [defaultVariant], create: [], remove: [], transition: { type: "NONE" } };
  if (defaultVariant && desired.length) return { keep: [], create: desired, remove: [], transition: { type: "SIMPLE_TO_MULTI", defaultVariantId: defaultVariant.id } };
  const existingKeys = new Set<string>(); for (const variant of existing) if (variant.combinationKey) { if (existingKeys.has(variant.combinationKey)) throw new Error("Duplicate existing variant combination."); existingKeys.add(variant.combinationKey); }
  if (existing.length && !desired.length) return { keep: [], create: [], remove: [], transition: { type: "MULTI_TO_SIMPLE", existingVariantIds: existing.map(variant => variant.id) } };
  const existingByKey = new Map(existing.filter(v => v.combinationKey).map(v => [v.combinationKey!, v])); const desiredKeys = new Set<string>(); const keep: typeof existing = []; const create: Combination[] = []; for (const combination of desired) { if (desiredKeys.has(combination.key)) throw new Error("Duplicate variant combination."); desiredKeys.add(combination.key); const variant = existingByKey.get(combination.key); if (variant) keep.push(variant); else create.push(combination); } return { keep, create, remove: existing.filter(variant => variant.combinationKey && !desiredKeys.has(variant.combinationKey)), transition: { type: "NONE" } };
}

export function validateVariantOptionSelections(
  variantProductId: string,
  selectedOptions: { optionId: string; optionProductId: string }[]
) {
  const seenOptions = new Set<string>();
  for (const selection of selectedOptions) {
    if (selection.optionProductId !== variantProductId) {
      throw new Error("Cross-product option assignment is not allowed.");
    }
    if (seenOptions.has(selection.optionId)) {
      throw new Error("Cannot select multiple values from the same option group for a single variant.");
    }
    seenOptions.add(selection.optionId);
  }
}
