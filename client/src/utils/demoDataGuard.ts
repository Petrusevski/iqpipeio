/**
 * demoDataGuard.ts
 *
 * Validates and sanitizes demo / showcase data before it is rendered or stored.
 * Ensures no real-looking PII leaks into the UI by enforcing:
 *   - Email addresses must use RFC-2606 reserved domains (example.com / example.org / example.net)
 *     or clearly fictional .invalid TLD — so they can NEVER resolve to a real mailbox.
 *   - Names must follow the masked format  "F**** L****"  (first letter + asterisks per word).
 *   - The helper `safeDemoEmail` / `safeDemoName` produce compliant values from raw strings.
 *
 * Usage:
 *   import { assertDemoSafe, safeDemoEmail, safeDemoName } from "@/utils/demoDataGuard";
 *
 *   // Throws in development if data is non-compliant:
 *   assertDemoSafe({ email: "a****@example.com", name: "A**** F****" });
 *
 *   // Or sanitize inline:
 *   const email = safeDemoEmail("alice@foundry.io"); // → "a****@example.com"
 *   const name  = safeDemoName("Alice Fontaine");    // → "A**** F****"
 */

// RFC-2606 reserved domains that can never belong to a real person.
const SAFE_DEMO_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.invalid",
]);

// Regex: first letter, asterisks, @ safe-domain
const MASKED_EMAIL_RE = /^[a-zA-Z]\*{4}@(example\.(com|org|net|invalid))$/;

// Regex: one or more words each starting with a capital letter followed by asterisks
const MASKED_NAME_RE = /^([A-Z]\*+\s?)+$/;

/** Returns true when an email is provably non-resolvable demo data. */
export function isSafeDemoEmail(email: string): boolean {
  if (MASKED_EMAIL_RE.test(email)) return true;
  // Allow plain user@example.com style too (no masking required for generic placeholders)
  try {
    const [, domain] = email.split("@");
    return SAFE_DEMO_DOMAINS.has(domain?.toLowerCase());
  } catch {
    return false;
  }
}

/** Returns true when a name follows the masked  A**** B****  convention. */
export function isSafeDemoName(name: string): boolean {
  return MASKED_NAME_RE.test(name.trim());
}

/**
 * Converts any email into a safe demo version.
 *   alice@foundry.io  →  a****@example.com
 *   you@company.com   →  y****@example.com
 */
export function safeDemoEmail(email: string): string {
  if (isSafeDemoEmail(email)) return email;
  const local = email.split("@")[0] ?? "u";
  return `${local[0].toLowerCase()}****@example.com`;
}

/**
 * Converts any full name into a safe masked version.
 *   Alice Fontaine  →  A**** F****
 *   Marcus Webb     →  M**** W****
 */
export function safeDemoName(name: string): string {
  if (isSafeDemoName(name)) return name;
  return name
    .trim()
    .split(/\s+/)
    .map((word) => (word.length > 0 ? `${word[0].toUpperCase()}****` : ""))
    .join(" ");
}

interface DemoRecord {
  email?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * In development, throws an error if any provided field violates the demo-data rules.
 * In production, logs a warning instead so the UI never hard-crashes.
 */
export function assertDemoSafe(record: DemoRecord, context = "demo data"): void {
  const violations: string[] = [];

  if (record.email !== undefined && !isSafeDemoEmail(record.email)) {
    violations.push(`email "${record.email}" is not a safe demo address (must use @example.com)`);
  }
  if (record.name !== undefined && !isSafeDemoName(record.name)) {
    violations.push(`name "${record.name}" is not masked (must follow "F**** L****" format)`);
  }

  if (violations.length === 0) return;

  const message = `[demoDataGuard] Privacy violation in ${context}:\n  • ${violations.join("\n  • ")}`;

  if (import.meta.env.DEV) {
    throw new Error(message);
  } else {
    console.warn(message);
  }
}

/**
 * Sanitizes an entire array of demo records in-place, returning a new array
 * where every email and name field is guaranteed to be safe.
 */
export function sanitizeDemoRecords<T extends DemoRecord>(records: T[]): T[] {
  return records.map((r) => ({
    ...r,
    ...(r.email !== undefined ? { email: safeDemoEmail(r.email) } : {}),
    ...(r.name  !== undefined ? { name:  safeDemoName(r.name)   } : {}),
  }));
}
