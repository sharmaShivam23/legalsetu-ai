// ==========================================================
// LegalSetu — Rights Clock: public entry point (server-only)
// ==========================================================

import { BNS_PUNISHMENT_TABLE } from "./bns-punishments.data";
import { computeRightsClock, type RightsClockInput, type RightsClockResult } from "./engine";
import { todayInIndia, type ISODate } from "./dates";

export const BNS_TABLE = BNS_PUNISHMENT_TABLE;

/** Computes the Rights Clock against the bundled BNS table, as of today in India unless told otherwise. */
export function runRightsClock(input: RightsClockInput, today: ISODate = todayInIndia()): RightsClockResult {
  return computeRightsClock(input, BNS_TABLE, today);
}

export * from "./engine";
export { formatDate, formatMonths, todayInIndia, type ISODate } from "./dates";
