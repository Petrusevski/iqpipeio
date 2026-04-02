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
 * Learned mappings are stored in the FieldMapping table per workspace+source.
 * On subsequent events from the same source, stored overrides are applied first
 * (including any manual corrections), then auto-detection fills remaining gaps.
 *
 * Design goals:
 *  - Never block ingestion: all errors are caught and silently fall back.
 *  - Fire-and-forget persistence: DB writes don't delay the response path.
 *  - Backward-compatible: only fills in fields that are empty/null.
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

export interface Detection {
  rawPath:         string;
  canonicalField:  CanonicalContactField;
  value:           string;
  confidence:      number;
  detectionMethod: "value_pattern" | "field_name" | "combined";
}

// ─── Value-based pattern detectors ───────────────────────────────────────────

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
// Must have 7+ consecutive digits (after stripping non-digits) and match common phone formats
const PHONE_RE    = /^\+?[\d][\d\s\-().]{6,22}$/;
const LINKEDIN_RE = /linkedin\.com\/(in|company)\/[\w%-]+/i;

// ─── Field-name hints ─────────────────────────────────────────────────────────
// Normalized (lowercase, no special chars) leaf key → canonical field

const FIELD_NAME_HINTS: Record<CanonicalContactField, string[]> = {
  "contact.email": [
    "email", "emailaddress", "email_address", "emailaddr", "mail",
    "contactemail", "workemail", "primaryemail", "useremail",
  ],
  "contact.phone": [
    "phone", "phonenumber", "phone_number", "phoneno", "mobile",
    "mobilenumber", "cellphone", "cell", "tel", "telephone", "contactphone",
  ],
  "contact.linkedin": [
    "linkedin", "linkedinurl", "linkedin_url", "linkedinprofile",
    "liurl", "linkedinlink", "profileurl", "linkedinhandle",
  ],
  "contact.firstName": [
    "firstname", "first_name", "givenname", "given_name", "fname",
    "forename", "contactfirst",
  ],
  "contact.lastName": [
    "lastname", "last_name", "familyname", "family_name", "surname",
    "lname", "contactlast",
  ],
  "contact.company": [
    "company", "companyname", "company_name", "organization", "org",
    "orgname", "account", "accountname", "employer", "firm",
    "workplace", "business", "businessname",
  ],
  "contact.title": [
    "title", "jobtitle", "job_title", "jobrole", "position",
    "role", "designation", "occupation", "seniority",
  ],
  "contact.anonymousId": [
    "anonymousid", "anonymous_id", "sessionid", "session_id",
    "visitorid", "visitor_id", "uid", "guestid", "trackingid",
  ],
};

// ─── Flatten nested payload to dot-path → string value ───────────────────────

export function flattenPayload(
  obj: unknown,
  prefix = "",
  out: Record<string, string> = {},
  depth = 0,
): Record<string, string> {
  if (depth > 8) return out; // guard against deeply nested payloads
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

// ─── Detect canonical field from value ───────────────────────────────────────

function detectByValue(value: string): { field: CanonicalContactField; confidence: number } | null {
  const v = value.trim();
  if (!v || v.length > 500) return null;

  if (EMAIL_RE.test(v)) {
    return { field: "contact.email", confidence: 0.92 };
  }
  if (LINKEDIN_RE.test(v)) {
    return { field: "contact.linkedin", confidence: 0.95 };
  }
  // Phone: require 7+ consecutive digits to reduce false positives on IDs
  const digits = v.replace(/\D/g, "");
  if (PHONE_RE.test(v) && digits.length >= 7 && digits.length <= 15) {
    return { field: "contact.phone", confidence: 0.75 };
  }

  return null;
}

// ─── Detect canonical field from field name ───────────────────────────────────

function detectByFieldName(path: string): { field: CanonicalContactField; confidence: number } | null {
  const segments = path.split(".");
  const leaf   = normalizeKey(segments[segments.length - 1]);
  const parent = segments.length > 1 ? normalizeKey(segments[segments.length - 2]) : "";

  for (const [cf, hints] of Object.entries(FIELD_NAME_HINTS) as [CanonicalContactField, string[]][]) {
    // Exact match on leaf
    if (hints.includes(leaf)) {
      return { field: cf, confidence: 0.82 };
    }
    // Leaf starts with or contains a long hint (≥5 chars) → partial match
    const longHints = hints.filter(h => h.length >= 5);
    if (longHints.some(h => leaf.startsWith(h) || h.startsWith(leaf))) {
      return { field: cf, confidence: 0.65 };
    }
    // Parent context + leaf combo
    if (parent && hints.some(h => (parent + leaf).includes(h) || leaf.includes(h.slice(0, 5)))) {
      return { field: cf, confidence: 0.58 };
    }
  }

  return null;
}

// ─── Run detection over a full payload ───────────────────────────────────────

export function detectFieldsSync(payload: unknown): Detection[] {
  const flat = flattenPayload(payload);
  const results: Detection[] = [];

  for (const [path, value] of Object.entries(flat)) {
    const v = value.trim();
    if (!v || v === "null" || v === "undefined" || v === "false") continue;

    const byValue = detectByValue(v);
    const byName  = detectByFieldName(path);

    if (byValue && byName && byValue.field === byName.field) {
      // Both signals agree — boost confidence
      results.push({
        rawPath:         path,
        canonicalField:  byValue.field,
        value:           v,
        confidence:      Math.min(0.99, byValue.confidence + 0.08),
        detectionMethod: "combined",
      });
    } else if (byValue) {
      results.push({
        rawPath:         path,
        canonicalField:  byValue.field,
        value:           v,
        confidence:      byValue.confidence,
        detectionMethod: "value_pattern",
      });
    } else if (byName && v.length >= 1 && v.length < 300) {
      results.push({
        rawPath:         path,
        canonicalField:  byName.field,
        value:           v,
        confidence:      byName.confidence,
        detectionMethod: "field_name",
      });
    }
  }

  return results;
}

// ─── Select best detection per canonical field ────────────────────────────────

function selectBest(detections: Detection[]): Map<CanonicalContactField, Detection> {
  const best = new Map<CanonicalContactField, Detection>();
  for (const d of detections) {
    const existing = best.get(d.canonicalField);
    if (!existing || d.confidence > existing.confidence) {
      best.set(d.canonicalField, d);
    }
  }
  return best;
}

// ─── Merge detections into contact (only fill gaps) ──────────────────────────

function mergeInto(current: ContactFields, best: Map<CanonicalContactField, Detection>, threshold: number): ContactFields {
  const r = { ...current };

  const fill = (cf: CanonicalContactField, setter: (v: string) => void) => {
    const d = best.get(cf);
    if (d && d.confidence >= threshold) setter(d.value);
  };

  if (!r.email)       fill("contact.email",       v => { r.email = v; });
  if (!r.phone)       fill("contact.phone",       v => { r.phone = v; });
  if (!r.linkedin)    fill("contact.linkedin",    v => { r.linkedin = v; });
  if (!r.firstName)   fill("contact.firstName",   v => { r.firstName = v; });
  if (!r.lastName)    fill("contact.lastName",    v => { r.lastName = v; });
  if (!r.company)     fill("contact.company",     v => { r.company = v; });
  if (!r.title)       fill("contact.title",       v => { r.title = v; });
  if (!r.anonymousId) fill("contact.anonymousId", v => { r.anonymousId = v; });

  return r;
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
    const cf = m.canonicalField as CanonicalContactField;
    const existing = result.get(cf);
    if (!existing || m.confidence > existing.confidence) {
      result.set(cf, {
        rawPath:         m.rawPath,
        canonicalField:  cf,
        value,
        confidence:      m.confidence,
        detectionMethod: m.detectionMethod as Detection["detectionMethod"],
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

// ─── Main export ──────────────────────────────────────────────────────────────

const AUTO_THRESHOLD = 0.70;

/**
 * Detect missing contact fields in `payload` and fill them into `currentContact`.
 *
 * Flow:
 *  1. Skip if all key identity fields (email/phone/linkedin) are already present.
 *  2. Load any stored/manual mappings for workspace+source and apply them first.
 *  3. If still sparse, run auto-detection on the full payload.
 *  4. Persist new detections to DB asynchronously (fire-and-forget).
 *  5. Return the enriched contact — original values are never overwritten.
 *
 * Errors are caught at every level; this function will never throw.
 */
export async function detectAndLearn(
  workspaceId: string,
  source: string,
  payload: unknown,
  currentContact: ContactFields = {},
): Promise<ContactFields> {
  try {
    if (!payload || typeof payload !== "object") return currentContact;

    const flat = flattenPayload(payload);
    if (Object.keys(flat).length === 0) return currentContact;

    // 1. Load stored/manual overrides and apply them (no threshold — always trust stored)
    const stored = await loadStoredMappings(workspaceId, source, flat);
    let enriched = mergeInto(currentContact, stored, 0.0);

    // 2. Check if auto-detection is still needed
    const identityFull = !!(enriched.email || enriched.phone || enriched.linkedin);
    const metaFull     = !!(enriched.firstName && enriched.company);
    if (identityFull && metaFull) return enriched;

    // 3. Auto-detect on the raw payload
    const rawDetections = runAutoDetection(flat, enriched);
    if (rawDetections.size > 0) {
      enriched = mergeInto(enriched, rawDetections, AUTO_THRESHOLD);

      // 4. Persist (fire-and-forget; don't block response)
      persistMappings(workspaceId, source, rawDetections).catch(err =>
        console.error("[fieldDetector] persist error:", err.message),
      );
    }

    return enriched;
  } catch (err: any) {
    console.error("[fieldDetector] detectAndLearn error:", err.message);
    return currentContact; // always fall back safely
  }
}

// ─── Auto-detection that skips already-filled fields ─────────────────────────

function runAutoDetection(
  flat: Record<string, string>,
  current: ContactFields,
): Map<CanonicalContactField, Detection> {
  const needed = new Set<CanonicalContactField>();
  if (!current.email)       needed.add("contact.email");
  if (!current.phone)       needed.add("contact.phone");
  if (!current.linkedin)    needed.add("contact.linkedin");
  if (!current.firstName)   needed.add("contact.firstName");
  if (!current.lastName)    needed.add("contact.lastName");
  if (!current.company)     needed.add("contact.company");
  if (!current.title)       needed.add("contact.title");
  if (!current.anonymousId) needed.add("contact.anonymousId");

  if (needed.size === 0) return new Map();

  const all = detectFieldsSync(flat);
  const filtered = all.filter(d => needed.has(d.canonicalField));
  return selectBest(filtered);
}
