// ==========================================================
// Builds lib/rights-clock/bns-punishments.data.ts from the BNS
// text in data/. Run after the source text changes:
//
//   npm run rights-clock:build
//
// The output is committed so the app never parses the Act at
// request time, and so every punishment figure the Rights Clock
// uses can be reviewed in a diff. tests/unit/rights-clock-data
// fails if the committed file drifts from a fresh parse.
//
// Why a .ts module holding a JSON string, not a .json import:
// TypeScript infers a literal type for every value in an imported
// JSON file (~56k types, ~100 MB of checker memory for this one),
// and a runtime fs read could be dropped from Next's standalone
// output. A declared type over a string costs neither.
// ==========================================================

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { buildPunishmentTable, serializeTableModule } from "../lib/rights-clock/punishment-table";

const SOURCE = path.join("data", "01 The Bharatiya Nyaya Sanhita, 2023.md");
const OUT = path.join("lib", "rights-clock", "bns-punishments.data.ts");

const table = buildPunishmentTable(readFileSync(SOURCE, "utf8"), SOURCE.replace(/\\/g, "/"));
writeFileSync(OUT, serializeTableModule(table), "utf8");

const sections = Object.values(table.sections);
const withPunishment = sections.filter((s) => s.punishment);
const unresolvable = withPunishment.filter((s) => !s.punishment!.resolvable);
console.log(
  `Wrote ${OUT}: ${sections.length} sections, ${withPunishment.length} with a punishment clause, ` +
    `${unresolvable.length} marked for manual review (punishment defined by reference).`
);
