// Validates a model rewrite against the facts the engine computed. The model
// may change wording only: any new number, unit, appliance, property, period,
// causal claim, guarantee or data-source claim makes the rewrite invalid and
// the deterministic text is used instead.
import { normalize } from "./ai.engine";

export interface GuardFacts {
  // Deterministic text the rewrite replaces; anything it already says is allowed.
  draft: string;
  // Structured values (metrics, cards, facts) the rewrite may cite.
  values: unknown;
  // Names the rewrite may mention, and the user's other names it must not.
  allowedNames: string[];
  forbiddenNames: string[];
  // True when the facts contain real measurements.
  measured: boolean;
}

export type GuardViolation =
  | "number" | "unit" | "name" | "source" | "causal" | "guarantee" | "period" | "insufficient" | "essential" | "length";

const UNITS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
  meia: 0.5, metade: 0.5,
};

// "duzentos e cinquenta e três" -> 253; "mil e duzentos" -> 1200.
const parseWords = (words: string[]) => {
  let total = 0, current = 0, seen = false;
  for (const word of words) {
    if (word === "e") continue;
    if (word === "mil") { total += (current || 1) * 1000; current = 0; seen = true; continue; }
    if (word in UNITS) { current += UNITS[word]; seen = true; continue; }
    break;
  }
  return seen ? total + current : null;
};

export interface Quantity { value: number; unit: "R$" | "kWh" | "%" | "h" | "W" | null; index: number }

const unitAfter = (rest: string): Quantity["unit"] => {
  const r = rest.trimStart();
  if (/^(kwh|quilowatt)/.test(r)) return "kWh";
  if (/^(%|por cento)/.test(r)) return "%";
  if (/^(reais|real)\b/.test(r)) return "R$";
  if (/^(w\b|watts?)/.test(r)) return "W";
  if (/^(h\b|horas?)/.test(r)) return "h";
  return null;
};

// Every quantity in a text, written with digits or in words.
export const extractQuantities = (text: string): Quantity[] => {
  const t = normalize(text);
  const out: Quantity[] = [];
  const digit = /(r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = digit.exec(t))) {
    const raw = match[2];
    let value: number;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) value = Number(raw.replace(/\./g, "").replace(",", "."));
    else value = Number(raw.replace(",", "."));
    const unit = match[1] ? "R$" : unitAfter(t.slice(match.index + match[0].length));
    out.push({ value, unit, index: match.index });
  }
  const tokens = [...t.matchAll(/[a-z]+/g)];
  for (let i = 0; i < tokens.length; i++) {
    if (!(tokens[i][0] in UNITS) && tokens[i][0] !== "mil") continue;
    if (tokens[i][0] === "cento" && tokens[i - 1]?.[0] === "por") continue;
    // Skip article-like "um"/"uma" not followed by a unit.
    let j = i;
    const words: string[] = [];
    while (j < tokens.length && (tokens[j][0] in UNITS || tokens[j][0] === "mil" || tokens[j][0] === "e")) words.push(tokens[j++][0]);
    while (words.at(-1) === "e") words.pop();
    const value = parseWords(words);
    const end = tokens[j - 1].index! + tokens[j - 1][0].length;
    const unit = unitAfter(t.slice(end));
    if (value !== null && (unit || value >= 11)) out.push({ value, unit, index: tokens[i].index! });
    i = j - 1;
  }
  return out;
};

const collect = (value: unknown, out: Set<number>) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    for (const v of [value, value * 100, value * 12, value / 1000]) for (const d of [0, 1, 2]) out.add(Number(v.toFixed(d)));
  } else if (typeof value === "string") {
    for (const q of extractQuantities(value)) out.add(q.value);
  } else if (Array.isArray(value)) value.forEach((item) => collect(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collect(item, out));
};

const SMALL = new Set([...Array(32).keys(), 12, 24, 30, 365]);
const CAUSAL = /(porque|por causa|devido|causad|causou|culpa|responsavel pel|explicad[oa] pel|motivo e|resultado d[oa] (seu|sua|uso))/;
const GUARANTEE = /(garant|com certeza|certamente|sem duvida|com seguranca|exatamente|vai economizar|economizara|100% d)/;
const PERIOD = /(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|ontem|anteontem|semana passada|ano passado|ultimo ano|ultimos \d+ (dias|meses)|trimestre|semestre)/g;
const MEASURED_CLAIM = /(?<!(?:nao|sem) (?:e |foi |esta |tem |possui |ha )?)(medid[oa]s?|medicao real|leitura real)/;
const INSUFFICIENT = /(nao (ha|tenho|existem?) (dados|informac|medic|historico)|insuficient|ainda nao da|nao e possivel|sem dados|nao (consigo|da para) (determinar|prever|comparar))/;
const ESSENTIAL_CUT = /(deslig|reduz|diminu|cortar|menos).{0,30}(geladeira|refrigerador|freezer|frigobar|roteador|alarme|camera|bomba)|(geladeira|refrigerador|freezer|frigobar|roteador|alarme|camera|bomba).{0,30}(deslig|reduz|diminu|menos tempo)/;

export const validateNarration = (text: string, facts: GuardFacts): GuardViolation[] => {
  const violations = new Set<GuardViolation>();
  const t = normalize(text);
  const draft = normalize(facts.draft);
  if (!t || text.length > 1500) violations.add("length");

  // Numbers: every quantity must exist in the facts, with a compatible unit.
  const allowed = new Set<number>();
  collect(facts.values, allowed);
  const draftQuantities = extractQuantities(facts.draft);
  for (const q of draftQuantities) allowed.add(q.value);
  const unitsOf = new Map<number, Set<string | null>>();
  for (const q of draftQuantities) unitsOf.set(q.value, (unitsOf.get(q.value) ?? new Set()).add(q.unit));
  for (const q of extractQuantities(text)) {
    const known = allowed.has(q.value) || allowed.has(Number(q.value.toFixed(2)));
    if (!known && !(SMALL.has(q.value) && (q.unit === null || q.unit === "h"))) { violations.add("number"); continue; }
    // A value the draft states with one unit cannot reappear with another.
    const draftUnits = unitsOf.get(q.value);
    if (q.unit && draftUnits && !draftUnits.has(q.unit) && ![...draftUnits].every((unit) => unit === null)) violations.add("unit");
  }

  // Names: no appliance, room or property beyond those in the facts.
  const cited = normalize(JSON.stringify(facts.values) ?? "");
  for (const name of facts.forbiddenNames) {
    const n = normalize(name);
    const mentioned = new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(t);
    if (n.length >= 2 && !facts.allowedNames.some((allowedName) => normalize(allowedName) === n) && mentioned && !draft.includes(n) && !cited.includes(n)) {
      violations.add("name");
    }
  }

  // Source: "medido" only when there are measurements or the draft says so.
  if (!facts.measured && MEASURED_CLAIM.test(t) && !MEASURED_CLAIM.test(draft)) violations.add("source");

  // Claims the draft does not make.
  if (CAUSAL.test(t) && !CAUSAL.test(draft)) violations.add("causal");
  if (GUARANTEE.test(t) && !GUARANTEE.test(draft)) violations.add("guarantee");
  for (const match of t.matchAll(PERIOD)) if (!draft.includes(match[0])) violations.add("period");
  if (INSUFFICIENT.test(draft) && !INSUFFICIENT.test(t)) violations.add("insufficient");
  if (ESSENTIAL_CUT.test(t) && !ESSENTIAL_CUT.test(draft)) violations.add("essential");
  return [...violations];
};
