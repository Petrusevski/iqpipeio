/**
 * fieldDetector.ts — Schema-resilient event normalization
 *
 * Scans arbitrary JSON payloads and maps fields to IQPipe's canonical contact
 * schema using a three-signal approach:
 *
 *  1. Value pattern match   — regex detects email, phone, LinkedIn URL
 *  2. Field name corroboration — leaf key hints (email, email_address, mail …)
 *  3. Combined signal       — both agree → confidence boosted
 *
 * Every detection now carries a human-readable `reason` field that explains
 * exactly why the match was made. This reason is preserved through selectBest,
 * mergeInto, and detectAndLearn, and is safe to expose in logs and the UI.
 *
 * Learned mappings are stored in the FieldMapping table per workspace+source.
 * On subsequent events from the same source, stored overrides are applied first
 * (including any manual corrections), then auto-detection fills remaining gaps.
 *
 * Design goals:
 *  - Never block ingestion: all errors are caught and silently fall back.
 *  - Fire-and-forget persistence: DB writes don't delay the response path.
 *  - Backward-compatible: detectAndLearn() still returns ContactFields.
 *    Use detectAndLearnWithReport() when you need the full explainability output.
 */

import { prisma } from "../db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CanonicalContactField =
  | "contact.email"
  | "contact.phone"
  | "contact.linkedin"
  | "contact.firstName"
  | "contact.lastName"
  | "contact.company"
  | "contact.title"
  | "contact.anonymousId";

export interface ContactFields {
  email?:       string | null;
  phone?:       string | null;
  linkedin?:    string | null;
  firstName?:   string;
  lastName?:    string;
  company?:     string | null;
  title?:       string | null;
  anonymousId?: string | null;
}

/**
 * A single candidate match for one canonical field.
 * `reason` is a human-readable sentence safe for logs and frontend display.
 */
export interface Detection {
  rawPath:         string;
  canonicalField:  CanonicalContactField;
  value:           string;
  confidence:      number;
  detectionMethod: "value_pattern" | "field_name" | "combined" | "stored" | "manual_override";
  reason:          string;
}

/**
 * A field that was detected but not applied — either below threshold,
 * already populated in the incoming contact, or lost to a higher-confidence
 * detection for the same canonical field.
 */
export interface SkippedDetection {
  rawPath:        string;
  canonicalField: CanonicalContactField;
  value:          string;
  confidence:     number;
  reason:         string;
  skippedBecause: "below_threshold" | "already_populated" | "lost_to_higher_confidence";
}

/**
 * Full explainability report returned by detectAndLearnWithReport().
 * appliedFields: what was actually filled into the contact object.
 * skippedDetections: everything that was detected but not applied, with why.
 * allDetections: every raw detection before selectBest filtering (for debugging).
 */
export interface DetectionReport {
  source:            string;
  appliedCount:      number;
  appliedFields:     AppliedField[];
  skippedDetections: SkippedDetection[];
  allDetections:     Detection[];
}

export interface AppliedField {
  canonicalField:  CanonicalContactField;
  rawPath:         string;
  value:           string;
  confidence:      number;
  detectionMethod: Detection["detectionMethod"];
  reason:          string;
  fromStore:       boolean; // true = loaded from DB (learned/manual); false = auto-detected this run
}

// ─── Value-based pattern detectors ───────────────────────────────────────────

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE    = /^\+?[\d][\d\s\-().]{6,22}$/;
const LINKEDIN_RE = /linkedin\.com\/(in|company)\/[\w%-]+/i;

// ─── Field-name hints ─────────────────────────────────────────────────────────

const FIELD_NAME_HINTS: Record<CanonicalContactField, string[]> = {
  "contact.email": [
    "email", "emailaddress", "emailaddr", "mail",
    "contactemail", "workemail", "primaryemail", "useremail",
  ],
  "contact.phone": [
    "phone", "phonenumber", "phoneno", "mobile",
    "mobilenumber", "cellphone", "cell", "tel", "telephone", "contactphone",
  ],
  "contact.linkedin": [
    "linkedin", "linkedinurl", "linkedinprofile",
    "liurl", "linkedinlink", "profileurl", "linkedinhandle",
  ],
  "contact.firstName": [
    "firstname", "givenname", "fname",
    "forename", "contactfirst",
  ],
  "contact.lastName": [
    "lastname", "familyname", "surname",
    "lname", "contactlast",
  ],
  "contact.company": [
    "company", "companyname", "organization", "org",
    "orgname", "account", "accountname", "employer", "firm",
    "workplace", "business", "businessname",
  ],
  "contact.title": [
    "title", "jobtitle", "jobrole", "position",
    "role", "designation", "occupation", "seniority",
  ],
  "contact.anonymousId": [
    "anonymousid", "sessionid", "visitorid",
    "uid", "guestid", "trackingid",
  ],
};

// ─── Flatten nested payload to dot-path → string value ───────────────────────

export function flattenPayload(
  obj: unknown,
  prefix = "",
  out: Record<string, string> = {},
  depth = 0,
): Record<string, string> {
  if (depth > 8) return out;
  if (obj === null || obj === undefined) return out;

  if (typeof obj === "object" && !Array.isArray(obj)) {
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (val !== null && val !== undefined && typeof val === "object" && !Array.isArray(val)) {
        flattenPayload(val, path, out, depth + 1);
      } else if (!Array.isArray(val) && typeof val !== "object") {
        out[path] = String(val ?? "");
      }
    }
  } else if (typeof obj !== "object") {
    if (prefix) out[prefix] = String(obj);
  }

  return out;
}

// ─── Normalize a key for hint matching ───────────────────────────────────────

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Value-based detection with reason ───────────────────────────────────────

function detectByValue(value: string): {
  field: CanonicalContactField;
  confidence: number;
  reason: string;
} | null {
  const v = value.trim();
  if (!v || v.length > 500) return null;

  if (EMAIL_RE.test(v)) {
    return {
      field:      "contact.email",
      confidence: 0.92,
      reason:     `Value "${v}" matches email format (user@domain.tld)`,
    };
  }
  if (LINKEDIN_RE.test(v)) {
    const match = v.match(LINKEDIN_RE)!;
    const profileType = match[1] === "company" ? "company" : "personal";
    return {
      field:      "contact.linkedin",
      confidence: 0.95,
      reason:     `Value contains a LinkedIn ${profileType} profile URL (linkedin.com/${match[1]}/)`,
    };
  }
  const digits = v.replace(/\D/g, "");
  if (PHONE_RE.test(v) && digits.length >= 7 && digits.length <= 15) {
    return {
      field:      "contact.phone",
      confidence: 0.75,
      reason:     `Value "${v}" matches phone number format (${digits.length} digits)`,
    };
  }

  return null;
}

// ─── Field-name detection with reason ────────────────────────────────────────

function detectByFieldName(path: string): {
  field: CanonicalContactField;
  confidence: number;
  reason: string;
} | null {
  const segments = path.split(".");
  const leafRaw  = segments[segments.length - 1];
  const leaf     = normalizeKey(leafRaw);
  const parent   = segments.length > 1 ? normalizeKey(segments[segments.length - 2]) : "";

  for (const [cf, hints] of Object.entries(FIELD_NAME_HINTS) as [CanonicalContactField, string[]][]) {
    // Exact match on leaf
    if (hints.includes(leaf)) {
      return {
        field:      cf,
        confidence: 0.82,
        reason:     `Field name "${leafRaw}" is a known alias for ${cf}`,
      };
    }
    // Partial match: leaf starts with or is a prefix of a long hint (≥5 chars)
    const longHints = hints.filter(h => h.length >= 5);
    const partialHit = longHints.find(h => leaf.startsWith(h) || h.startsWith(leaf));
    if (partialHit) {
      return {
        field:      cf,
        confidence: 0.65,
        reason:     `Field name "${leafRaw}" partially matches known alias "${partialHit}" for ${cf}`,
      };
    }
    // Parent context + leaf combo
    if (parent) {
      const contextHit = hints.find(h =>
        (parent + leaf).includes(h) || leaf.includes(h.slice(0, 5)),
      );
      if (contextHit) {
        return {
          field:      cf,
          confidence: 0.58,
          reason:     `Field path context "${segments.slice(-2).join(".")}" resembles ${cf} (matched on "${contextHit}")`,
        };
      }
    }
  }

  return null;
}

// ─── Run detection over a full payload — returns Detection[] with reasons ─────

export function detectFieldsSync(payload: unknown): Detection[] {
  const flat    = typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? flattenPayload(payload)
    : flattenPayload({ _root: payload });
  const results: Detection[] = [];

  for (const [path, value] of Object.entries(flat)) {
    const v = value.trim();
    if (!v || v === "null" || v === "undefined" || v === "false") continue;

    const byValue = detectByValue(v);
    const byName  = detectByFieldName(path);

    if (byValue && byName && byValue.field === byName.field) {
      const boostedConfidence = Math.min(0.99, byValue.confidence + 0.08);
      results.push({
        rawPath:         path,
        canonicalField:  byValue.field,
        value:           v,
        confidence:      boostedConfidence,
        detectionMethod: "combined",
        reason:          `${byValue.reason}; and ${byName.reason.toLowerCase()} — both signals agree (confidence boosted to ${(boostedConfidence * 100).toFixed(0)}%)`,
      });
    } else if (byValue) {
      results.push({
        rawPath:         path,
        canonicalField:  byValue.field,
        value:           v,
        confidence:      byValue.confidence,
        detectionMethod: "value_pattern",
        reason:          byValue.reason,
      });
    } else if (byName && v.length >= 1 && v.length < 300) {
      results.push({
        rawPath:         path,
        canonicalField:  byName.field,
        value:           v,
        confidence:      byName.confidence,
        detectionMethod: "field_name",
        reason:          byName.reason,
      });
    }
  }

  return results;
}

// ─── Select best detection per canonical field ────────────────────────────────
// Returns both the winning map AND the detections that lost (for the report).

function selectBest(detections: Detection[]): {
  best:    Map<CanonicalContactField, Detection>;
  losers:  SkippedDetection[];
} {
  const best   = new Map<CanonicalContactField, Detection>();
  const losers: SkippedDetection[] = [];

  for (const d of detections) {
    const existing = best.get(d.canonicalField);
    if (!existing) {
      best.set(d.canonicalField, d);
    } else if (d.confidence > existing.confidence) {
      // Demote the previous winner
      losers.push({
        rawPath:        existing.rawPath,
        canonicalField: existing.canonicalField,
        value:          existing.value,
        confidence:     existing.confidence,
        reason:         existing.reason,
        skippedBecause: "lost_to_higher_confidence",
      });
      best.set(d.canonicalField, d);
    } else {
      // This candidate lost
      losers.push({
        rawPath:        d.rawPath,
        canonicalField: d.canonicalField,
        value:          d.value,
        confidence:     d.confidence,
        reason:         d.reason,
        skippedBecause: "lost_to_higher_confidence",
      });
    }
  }

  return { best, losers };
}

// ─── Merge detections into contact — returns enriched contact + applied log ───

function mergeInto(
  current: ContactFields,
  best:    Map<CanonicalContactField, Detection>,
  threshold: number,
  fromStore: boolean,
): {
  enriched:      ContactFields;
  applied:       AppliedField[];
  belowThreshold: SkippedDetection[];
  alreadySet:     SkippedDetection[];
} {
  const enriched      = { ...current };
  const applied:       AppliedField[]     = [];
  const belowThreshold: SkippedDetection[] = [];
  const alreadySet:     SkippedDetection[] = [];

  const tryFill = (
    cf: CanonicalContactField,
    isSet: boolean,
    setter: (v: string) => void,
  ) => {
    const d = best.get(cf);
    if (!d) return;

    if (isSet) {
      alreadySet.push({
        rawPath:        d.rawPath,
        canonicalField: cf,
        value:          d.value,
        confidence:     d.confidence,
        reason:         d.reason,
        skippedBecause: "already_populated",
      });
      return;
    }

    if (d.confidence < threshold) {
      belowThreshold.push({
        rawPath:        d.rawPath,
        canonicalField: cf,
        value:          d.value,
        confidence:     d.confidence,
        reason:         d.reason + ` (confidence ${(d.confidence * 100).toFixed(0)}% is below threshold ${(threshold * 100).toFixed(0)}%)`,
        skippedBecause: "below_threshold",
      });
      return;
    }

    setter(d.value);
    applied.push({
      canonicalField:  cf,
      rawPath:         d.rawPath,
      value:           d.value,
      confidence:      d.confidence,
      detectionMethod: d.detectionMethod,
      reason:          d.reason,
      fromStore,
    });
  };

  tryFill("contact.email",       !!(enriched.email),       v => { enriched.email       = v; });
  tryFill("contact.phone",       !!(enriched.phone),       v => { enriched.phone       = v; });
  tryFill("contact.linkedin",    !!(enriched.linkedin),    v => { enriched.linkedin    = v; });
  tryFill("contact.firstName",   !!(enriched.firstName),   v => { enriched.firstName   = v; });
  tryFill("contact.lastName",    !!(enriched.lastName),    v => { enriched.lastName    = v; });
  tryFill("contact.company",     !!(enriched.company),     v => { enriched.company     = v; });
  tryFill("contact.title",       !!(enriched.title),       v => { enriched.title       = v; });
  tryFill("contact.anonymousId", !!(enriched.anonymousId), v => { enriched.anonymousId = v; });

  return { enriched, applied, belowThreshold, alreadySet };
}

// ─── Load existing learned/manual mappings from DB ───────────────────────────

async function loadStoredMappings(
  workspaceId: string,
  source: string,
  flat: Record<string, string>,
): Promise<Map<CanonicalContactField, Detection>> {
  const paths = Object.keys(flat);
  if (paths.length === 0) return new Map();

  const stored = await prisma.fieldMapping.findMany({
    where: {
      workspaceId,
      source,
      isRejected: false,
      rawPath: { in: paths },
    },
  });

  const result = new Map<CanonicalContactField, Detection>();
  for (const m of stored) {
    const value = flat[m.rawPath];
    if (!value) continue;

    const cf    = m.canonicalField as CanonicalContactField;
    const method = m.isOverride
      ? ("manual_override" as const)
      : (m.detectionMethod as Detection["detectionMethod"]);
    const reason = m.isOverride
      ? `Manually mapped to ${cf} by a workspace user`
      : `Previously learned mapping for ${cf} from "${m.rawPath}" (used ${m.useCount} time${m.useCount === 1 ? "" : "s"})`;

    const existing = result.get(cf);
    if (!existing || m.confidence > existing.confidence) {
      result.set(cf, {
        rawPath:         m.rawPath,
        canonicalField:  cf,
        value,
        confidence:      m.confidence,
        detectionMethod: method,
        reason,
      });
    }
  }

  return result;
}

// ─── Persist detections to DB (fire-and-forget) ──────────────────────────────

async function persistMappings(
  workspaceId: string,
  source: string,
  detections: Map<CanonicalContactField, Detection>,
): Promise<void> {
  const ops = Array.from(detections.values()).map(d =>
    prisma.fieldMapping.upsert({
      where: {
        workspaceId_source_rawPath: { workspaceId, source, rawPath: d.rawPath },
      },
      update: {
        confidence:      d.confidence,
        detectionMethod: d.detectionMethod,
        useCount:        { increment: 1 },
        lastSeenAt:      new Date(),
      },
      create: {
        workspaceId,
        source,
        rawPath:         d.rawPath,
        canonicalField:  d.canonicalField,
        confidence:      d.confidence,
        detectionMethod: d.detectionMethod,
        useCount:        1,
      },
    })
  );
  await Promise.all(ops);
}

// ─── Auto-detection that skips already-filled fields ─────────────────────────

function runAutoDetection(
  flat:    Record<string, string>,
  current: ContactFields,
): {
  best:   Map<CanonicalContactField, Detection>;
  losers: SkippedDetection[];
  all:    Detection[];
} {
  const needed = new Set<CanonicalContactField>();
  if (!current.email)       needed.add("contact.email");
  if (!current.phone)       needed.add("contact.phone");
  if (!current.linkedin)    needed.add("contact.linkedin");
  if (!current.firstName)   needed.add("contact.firstName");
  if (!current.lastName)    needed.add("contact.lastName");
  if (!current.company)     needed.add("contact.company");
  if (!current.title)       needed.add("contact.title");
  if (!current.anonymousId) needed.add("contact.anonymousId");

  if (needed.size === 0) return { best: new Map(), losers: [], all: [] };

  const all      = detectFieldsSync(flat);
  const filtered = all.filter(d => needed.has(d.canonicalField));
  const { best, losers } = selectBest(filtered);

  return { best, losers, all };
}

// ─── Threshold ────────────────────────────────────────────────────────────────

const AUTO_THRESHOLD = 0.70;

// ─── detectAndLearn — backward-compatible, returns ContactFields only ─────────

/**
 * Detect missing contact fields in `payload` and fill them into `currentContact`.
 * Returns enriched ContactFields. For the full explainability report, use
 * detectAndLearnWithReport() instead.
 *
 * This function never throws — errors fall back to returning currentContact as-is.
 */
export async function detectAndLearn(
  workspaceId: string,
  source: string,
  payload: unknown,
  currentContact: ContactFields = {},
): Promise<ContactFields> {
  const result = await detectAndLearnWithReport(workspaceId, source, payload, currentContact);
  return result.contact;
}

// ─── detectAndLearnWithReport — full explainability output ───────────────────

/**
 * Same as detectAndLearn() but also returns a DetectionReport with:
 *  - appliedFields: what was actually filled in and why
 *  - skippedDetections: what was detected but not applied and why
 *  - allDetections: every raw detection for debugging
 *
 * Safe to call from API routes — errors still fall back to the original contact.
 */
export async function detectAndLearnWithReport(
  workspaceId: string,
  source: string,
  payload: unknown,
  currentContact: ContactFields = {},
): Promise<{ contact: ContactFields; report: DetectionReport }> {
  const emptyReport: DetectionReport = {
    source,
    appliedCount:      0,
    appliedFields:     [],
    skippedDetections: [],
    allDetections:     [],
  };

  try {
    if (!payload || typeof payload !== "object") {
      return { contact: currentContact, report: emptyReport };
    }

    const flat = flattenPayload(payload);
    if (Object.keys(flat).length === 0) {
      return { contact: currentContact, report: emptyReport };
    }

    const allSkipped: SkippedDetection[] = [];

    // 1. Load stored/manual overrides and apply them (no threshold — always trust stored)
    const stored = await loadStoredMappings(workspaceId, source, flat);
    const storedMerge = mergeInto(currentContact, stored, 0.0, true);
    let enriched = storedMerge.enriched;
    const appliedFields: AppliedField[] = [...storedMerge.applied];
    allSkipped.push(...storedMerge.alreadySet, ...storedMerge.belowThreshold);

    // 2. Check if auto-detection is still needed
    const identityFull = !!(enriched.email || enriched.phone || enriched.linkedin);
    const metaFull     = !!(enriched.firstName && enriched.company);

    let allDetections: Detection[] = [];

    if (!identityFull || !metaFull) {
      // 3. Auto-detect on the raw payload
      const { best: autoDetections, losers, all } = runAutoDetection(flat, enriched);
      allDetections = all;
      allSkipped.push(...losers);

      if (autoDetections.size > 0) {
        const autoMerge = mergeInto(enriched, autoDetections, AUTO_THRESHOLD, false);
        enriched = autoMerge.enriched;
        appliedFields.push(...autoMerge.applied);
        allSkipped.push(...autoMerge.belowThreshold, ...autoMerge.alreadySet);

        // 4. Persist (fire-and-forget; don't block response)
        persistMappings(workspaceId, source, autoDetections).catch(err =>
          console.error("[fieldDetector] persist error:", err.message),
        );
      }
    }

    const report: DetectionReport = {
      source,
      appliedCount:      appliedFields.length,
      appliedFields,
      skippedDetections: allSkipped,
      allDetections,
    };

    return { contact: enriched, report };

  } catch (err: any) {
    console.error("[fieldDetector] detectAndLearnWithReport error:", err.message);
    return { contact: currentContact, report: emptyReport };
  }
}
