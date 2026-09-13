// ==========================================================
// LegalSetu — repairing model-written Mermaid flowcharts
// ----------------------------------------------------------
// Every chat model can be asked for the same flowchart, but they
// do not all write Mermaid equally carefully. The single most
// common breakage is punctuation inside a node label —
//   A[File FIR (Section 173)]      B{Deadline: 30 days?}
// — where the parentheses or colon are read as syntax and the
// whole diagram fails to parse. Quoting the label text makes any
// character legal:
//   A["File FIR (Section 173)"]    B{"Deadline: 30 days?"}
//
// This is only ever applied to a diagram that has already failed
// to parse, so a correct diagram is never touched.
// ==========================================================

/** Node shapes, longest delimiters first so "([" wins over "(". */
const SHAPES: [open: string, close: string][] = [
  ["([", "])"],
  ["[(", ")]"],
  ["((", "))"],
  ["[[", "]]"],
  ["{{", "}}"],
  ["[", "]"],
  ["{", "}"],
  ["(", ")"],
  [">", "]"],
];

const EDGE = /(\s*(?:-\.->|={2,}>|-{2,}>|-{3,}|-{2}(?![->]))\s*(?:\|[^|]*\|)?\s*)/;

function cleanLabel(text: string): string {
  return text
    .replace(/[“”„]/g, "'")
    .replace(/[‘’]/g, "'")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quotes the label of a single node token such as `A[Do (this)]`. */
function repairNode(token: string): string {
  const match = token.match(/^(\s*)([A-Za-z0-9_]+)(.*?)(\s*)$/s);
  if (!match) return token;
  const [, lead, id, rest, trail] = match;
  if (!rest) return token;

  for (const [open, close] of SHAPES) {
    if (rest.startsWith(open) && rest.endsWith(close) && rest.length >= open.length + close.length) {
      const inner = rest.slice(open.length, rest.length - close.length);
      const trimmed = inner.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) return token;
      return `${lead}${id}${open}"${cleanLabel(inner)}"${close}${trail}`;
    }
  }
  return token;
}

/** Quotes an edge label: `-->|Yes: now|` becomes `-->|"Yes: now"|`. */
function repairEdge(edge: string): string {
  return edge.replace(/\|([^|]*)\|/, (full, label: string) => {
    const t = label.trim();
    if (!t || (t.startsWith('"') && t.endsWith('"'))) return full;
    return `|"${cleanLabel(label)}"|`;
  });
}

const PASSTHROUGH = /^\s*(%%|classDef\b|class\b|style\b|linkStyle\b|click\b|subgraph\b|end\b|direction\b)/;

export function repairMermaid(source: string): string {
  const lines = source
    .replace(/^\s*```(?:mermaid)?\s*$/gim, "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const out: string[] = [];
  let sawHeader = false;

  for (const raw of lines) {
    const line = raw.replace(/;\s*$/, "");
    if (!line.trim()) continue;

    if (!sawHeader) {
      const header = line.trim().match(/^(flowchart|graph)\s+(TD|TB|BT|RL|LR)\b/i);
      if (header) {
        out.push(`flowchart ${header[2].toUpperCase()}`);
        sawHeader = true;
        continue;
      }
      // A diagram that forgot its header entirely.
      out.push("flowchart TD");
      sawHeader = true;
    }

    if (PASSTHROUGH.test(line)) {
      out.push(line);
      continue;
    }

    const parts = line.split(EDGE);
    const repaired = parts
      .map((part, i) => {
        // Odd indices are the captured edge operators.
        if (i % 2 === 1) return repairEdge(part);
        return part
          .split(/(\s*&\s*)/)
          .map((node, j) => (j % 2 === 1 ? node : repairNode(node)))
          .join("");
      })
      .join("");

    out.push(repaired);
  }

  if (!sawHeader) out.unshift("flowchart TD");
  return out.join("\n");
}
