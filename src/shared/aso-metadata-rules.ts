/**
 * App store listing checks for the App Store and Google Play. Pure and free of
 * I/O, so an agent can loop against it as often as it likes.
 *
 * Every issue names where its rule comes from. `store` rules are published by
 * Apple (App Store Connect field reference, App Review Guideline 2.3.7) or
 * Google (Play Console listing limits, Play metadata policy). `heuristic` rules
 * are common ASO practice that neither store documents: how Apple combines
 * words across fields, plural matching, wasted separator bytes, stuffing
 * thresholds. Agents should weigh the two differently.
 */

export type AppStore = "app_store" | "google_play";

type AsoField =
  | "name"
  | "subtitle"
  | "keywords"
  | "developerName"
  | "shortDescription"
  | "fullDescription";

export type AppMetadataInput =
  | {
      store: "app_store";
      name?: string;
      subtitle?: string;
      /** The comma-separated keyword field from App Store Connect. */
      keywords?: string;
      /** Apple indexes the company name too, so it counts for coverage. */
      developerName?: string;
      targetKeywords?: string[];
    }
  | {
      store: "google_play";
      name?: string;
      shortDescription?: string;
      fullDescription?: string;
      targetKeywords?: string[];
    };

type LengthUnit = "characters" | "bytes";

type FieldReport = {
  field: AsoField;
  length: number;
  limit: number;
  unit: LengthUnit;
  /** Negative when the field is over its limit. */
  remaining: number;
};

type AsoIssue = {
  severity: "error" | "warning" | "info";
  source: "store" | "heuristic";
  field: AsoField | null;
  code: string;
  message: string;
};

type KeywordCoverage = {
  keyword: string;
  covered: boolean;
  /** Target tokens that appear in none of the indexed fields. */
  missingTokens: string[];
  /**
   * App Store: fields that contribute at least one of the phrase's tokens.
   * Google Play: fields that contain the whole phrase.
   */
  fields: AsoField[];
};

export type AppMetadataReport = {
  store: AppStore;
  fields: FieldReport[];
  issues: AsoIssue[];
  /** How `coverage` decides a phrase is covered, and whether it's documented. */
  coverageRule: string;
  coverage: KeywordCoverage[];
};

type AppStoreInput = Extract<AppMetadataInput, { store: "app_store" }>;
type PlayInput = Extract<AppMetadataInput, { store: "google_play" }>;

const COVERAGE_RULES: Record<AppStore, string> = {
  app_store:
    "Heuristic: a phrase is covered when each of its words appears somewhere in the name, subtitle, keyword field or company name. Apple doesn't document how it combines fields; this is observed behavior.",
  google_play:
    "A phrase is covered when it appears word for word in the title, short description or full description.",
};

type FieldRule = { field: AsoField; limit: number; unit: LengthUnit };

const FIELD_RULES: Record<AppStore, FieldRule[]> = {
  app_store: [
    { field: "name", limit: 30, unit: "characters" },
    { field: "subtitle", limit: 30, unit: "characters" },
    { field: "keywords", limit: 100, unit: "bytes" },
  ],
  google_play: [
    { field: "name", limit: 30, unit: "characters" },
    { field: "shortDescription", limit: 80, unit: "characters" },
    { field: "fullDescription", limit: 4000, unit: "characters" },
  ],
};

/** Fields each store accepts, for callers that take a flat input. */
export const APP_STORE_FIELDS: Record<AppStore, readonly AsoField[]> = {
  app_store: ["name", "subtitle", "keywords", "developerName"],
  google_play: ["name", "shortDescription", "fullDescription"],
};

const utf8 = new TextEncoder();

function measure(value: string, unit: LengthUnit) {
  // UTF-16 units after NFC, as a browser form's maxlength counts them. That
  // can overcount an emoji, never undercount, so a draft that fits here fits
  // in the console.
  return unit === "bytes"
    ? utf8.encode(value).length
    : value.normalize("NFC").length;
}

/** Lowercased letter/number runs. Space-delimited languages only. */
function tokenize(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/['’]/g, "")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function countPhrase(haystack: string[], phrase: string[]) {
  let count = 0;
  for (let i = 0; i + phrase.length <= haystack.length; i++) {
    if (phrase.every((token, j) => haystack[i + j] === token)) count++;
  }
  return count;
}

/** English-only, and deliberately loose: it also pairs "new" with "news". */
function isPossiblePlural(plural: string, singular: string) {
  if (singular.length < 3) return false;
  return (
    plural === `${singular}s` ||
    plural === `${singular}es` ||
    (singular.endsWith("y") && plural === `${singular.slice(0, -1)}ies`)
  );
}

// App Review Guideline 2.3.7 (Apple) and the Play metadata policy (Google)
// both bar pricing and promotion terms from store metadata.
const PRICE_TERMS =
  /\bfree\b|\d+\s?% ?off\b|\bsale\b|\bdiscount|\bcash ?back\b|\blimited time\b/i;
// Play metadata policy: no store performance, ranking or Play program claims
// in the title.
const PLAY_CLAIM_TERMS =
  /#\s?1\b|\bno\.? ?1\b|\bnumber one\b|\btop\b|\bbest\b|\bapp of the year\b|\bpopular\b|\baward|\beditor'?s'? choice\b|\bnew\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const REPEATED_SYMBOL = /([^\p{L}\p{N}\s])\1/u;

function lengthReports(input: AppMetadataInput) {
  const fields: FieldReport[] = [];
  const issues: AsoIssue[] = [];
  for (const rule of FIELD_RULES[input.store]) {
    const value = fieldValue(input, rule.field);
    if (value === undefined) continue;
    const length = measure(value, rule.unit);
    fields.push({ ...rule, length, remaining: rule.limit - length });
    if (length > rule.limit) {
      issues.push({
        severity: "error",
        source: "store",
        field: rule.field,
        code: "over_limit",
        message: `${length} ${rule.unit}, over the ${rule.limit}-${rule.unit === "bytes" ? "byte" : "character"} limit by ${length - rule.limit}.`,
      });
    }
  }
  if (
    input.store === "app_store" &&
    input.name !== undefined &&
    measure(input.name, "characters") < 2
  ) {
    issues.push({
      severity: "error",
      source: "store",
      field: "name",
      code: "under_limit",
      message: "Apple requires an app name of at least 2 characters.",
    });
  }
  return { fields, issues };
}

function fieldValue(input: AppMetadataInput, field: AsoField) {
  const record: Partial<Record<AsoField, string>> = input;
  return record[field];
}

function priceTermIssues(input: AppMetadataInput) {
  const fields: AsoField[] =
    input.store === "app_store" ? ["name", "subtitle", "keywords"] : ["name"];
  const rule =
    input.store === "app_store"
      ? "App Review Guideline 2.3.7"
      : "the Play metadata policy";
  return fields.flatMap((field): AsoIssue[] => {
    const match = PRICE_TERMS.exec(fieldValue(input, field) ?? "");
    if (!match) return [];
    return [
      {
        severity: "warning",
        source: "store",
        field,
        code: "price_or_promotion",
        message: `"${match[0]}" reads as pricing or promotion, which ${rule} bars from this field.`,
      },
    ];
  });
}

function keywordFieldIssues(input: AppStoreInput) {
  const issues: AsoIssue[] = [];
  const raw = input.keywords;
  if (raw === undefined) return issues;
  const issue = (
    severity: AsoIssue["severity"],
    source: AsoIssue["source"],
    code: string,
    message: string,
  ) => issues.push({ severity, source, field: "keywords", code, message });

  const spacedBytes = (raw.match(/\s*,\s*/g) ?? []).reduce(
    (sum, run) => sum + utf8.encode(run).length - 1,
    0,
  );
  if (spacedBytes > 0) {
    issue(
      "warning",
      "heuristic",
      "spaces_around_commas",
      `Spaces next to commas waste ${spacedBytes} byte${spacedBytes === 1 ? "" : "s"}; commas alone separate entries.`,
    );
  }

  const entries = raw.split(",").map((entry) => entry.trim());
  if (entries.some((entry) => entry === "")) {
    issue(
      "warning",
      "heuristic",
      "empty_entry",
      "Empty entries (doubled or trailing commas) waste bytes.",
    );
  }
  const tooShort = entries.filter(
    (entry) => entry !== "" && measure(entry, "characters") <= 2,
  );
  if (tooShort.length > 0) {
    issue(
      "error",
      "store",
      "entry_too_short",
      `Apple requires each keyword to be longer than two characters: ${tooShort.join(", ")}.`,
    );
  }

  const keywordTokens = tokenize(raw);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const token of keywordTokens) {
    if (seen.has(token)) duplicates.add(token);
    seen.add(token);
  }
  if (duplicates.size > 0) {
    issue(
      "warning",
      "heuristic",
      "duplicate_keyword",
      `Repeated in the keyword field: ${[...duplicates].join(", ")}. Once is enough.`,
    );
  }

  const nameTokens = tokenize(
    `${input.name ?? ""} ${input.developerName ?? ""}`,
  );
  const inName = [...seen].filter((token) => nameTokens.includes(token));
  if (inName.length > 0) {
    issue(
      "warning",
      "store",
      "repeats_name",
      `Already in the app or company name: ${inName.join(", ")}. Apple indexes those, and says not to repeat them in keywords.`,
    );
  }
  const subtitleTokens = tokenize(input.subtitle ?? "");
  const inSubtitle = [...seen].filter(
    (token) => subtitleTokens.includes(token) && !inName.includes(token),
  );
  if (inSubtitle.length > 0) {
    issue(
      "warning",
      "heuristic",
      "repeats_subtitle",
      `Already in the subtitle: ${inSubtitle.join(", ")}. Apple is observed to index subtitle words, so these bytes can go to new words.`,
    );
  }

  const otherTokens = new Set([
    ...tokenize(`${input.name ?? ""} ${input.subtitle ?? ""}`),
    ...seen,
  ]);
  const plurals = new Set<string>();
  for (const token of seen) {
    for (const other of otherTokens) {
      if (isPossiblePlural(token, other)) plurals.add(`${token}/${other}`);
      if (isPossiblePlural(other, token)) plurals.add(`${other}/${token}`);
    }
  }
  if (plurals.size > 0) {
    issue(
      "info",
      "heuristic",
      "possible_plural",
      `Possible plural pairs: ${[...plurals].join(", ")}. Apple is observed to match singular and plural forms, so one of each may be enough. English-only check.`,
    );
  }
  return issues;
}

function playNameIssues(input: PlayInput) {
  const name = input.name;
  if (name === undefined) return [];
  const issues: AsoIssue[] = [];
  const policy = (code: string, message: string) =>
    issues.push({
      severity: "warning",
      source: "store",
      field: "name",
      code,
      message,
    });

  const claim = PLAY_CLAIM_TERMS.exec(name);
  if (claim) {
    policy(
      "performance_claim",
      `"${claim[0]}" reads as a ranking, performance or Play program claim, which the Play metadata policy bars from titles.`,
    );
  }
  if (EMOJI.test(name)) {
    policy("emoji", "The Play metadata policy bars emoji from titles.");
  }
  if (REPEATED_SYMBOL.test(name)) {
    policy(
      "repeated_symbol",
      "The Play metadata policy bars repeated special characters from titles.",
    );
  }
  // Only cased scripts can be ALL CAPS.
  const upperCount = name.match(/\p{Lu}/gu)?.length ?? 0;
  if (upperCount >= 4 && !/\p{Ll}/u.test(name)) {
    policy(
      "all_caps",
      "The Play metadata policy bars ALL CAPS titles unless the caps are part of the brand name.",
    );
  }
  return issues;
}

// Stuffing thresholds for one target phrase in one Play field. Google names
// "repetitive keywords" as a policy problem without a number, so these are
// conservative guesses.
const PLAY_REPEAT_LIMITS: Partial<Record<AsoField, number>> = {
  name: 1,
  shortDescription: 1,
  fullDescription: 5,
};

function coverageReport(input: AppMetadataInput) {
  // One entry per distinct phrase, keeping the caller's first spelling.
  const targets = new Map<string, string>();
  for (const keyword of input.targetKeywords ?? []) {
    const key = tokenize(keyword).join(" ");
    if (key && !targets.has(key)) targets.set(key, keyword.trim());
  }
  const fieldTokens = APP_STORE_FIELDS[input.store].flatMap((field) => {
    const value = fieldValue(input, field);
    return value === undefined ? [] : [{ field, tokens: tokenize(value) }];
  });
  const issues: AsoIssue[] = [];

  const coverage = [...targets.values()].map((keyword): KeywordCoverage => {
    const phrase = tokenize(keyword);
    const missingTokens = phrase.filter(
      (token) => !fieldTokens.some(({ tokens }) => tokens.includes(token)),
    );
    if (input.store === "app_store") {
      return {
        keyword,
        covered: missingTokens.length === 0,
        missingTokens,
        fields: fieldTokens
          .filter(({ tokens }) => phrase.some((t) => tokens.includes(t)))
          .map(({ field }) => field),
      };
    }
    for (const { field, tokens } of fieldTokens) {
      const count = countPhrase(tokens, phrase);
      const limit = PLAY_REPEAT_LIMITS[field];
      if (limit !== undefined && count > limit) {
        issues.push({
          severity: "warning",
          source: "heuristic",
          field,
          code: "repeated_keyword",
          message: `"${keyword}" appears ${count} times; Google Play treats repetitive keywords as a policy problem.`,
        });
      }
    }
    const fields = fieldTokens
      .filter(({ tokens }) => countPhrase(tokens, phrase) > 0)
      .map(({ field }) => field);
    return { keyword, covered: fields.length > 0, missingTokens, fields };
  });
  return { coverage, issues };
}

export function validateAppMetadata(
  input: AppMetadataInput,
): AppMetadataReport {
  const lengths = lengthReports(input);
  const coverage = coverageReport(input);
  const issues = [
    ...lengths.issues,
    ...priceTermIssues(input),
    ...(input.store === "app_store"
      ? keywordFieldIssues(input)
      : playNameIssues(input)),
    ...coverage.issues,
  ];
  return {
    store: input.store,
    fields: lengths.fields,
    issues,
    coverageRule: COVERAGE_RULES[input.store],
    coverage: coverage.coverage,
  };
}
