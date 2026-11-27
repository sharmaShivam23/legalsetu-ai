import type { IFlagsmithFeature } from "@flagsmith/flagsmith/types";

/**
 * Picks the branch for the variation a visitor was served. This is the one
 * code convention Verdict's cleanup step understands:
 *
 *   const label = pick(useExperiment("my_flag"), { control: "A", variant_a: "B" });
 *
 * Keys are the flag VALUES ("control" and each variation's string value). A
 * missing flag, a disabled flag or an unknown value falls back to control, so
 * a visitor never sees a broken page.
 */
export function pick<T>(
  flag: IFlagsmithFeature | null | undefined,
  branches: { control: T } & Record<string, T>,
): T {
  if (!flag || flag.enabled === false || typeof flag.value !== "string") return branches.control;
  return Object.hasOwn(branches, flag.value) ? branches[flag.value] : branches.control;
}
