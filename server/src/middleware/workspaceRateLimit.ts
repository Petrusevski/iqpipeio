/**
 * DEPRECATED — superseded by DB-backed rate limiting in utils/quota.ts
 *
 * The per-minute counter (eventCountMinute + rateLimitResetAt) now lives in
 * the Workspace table alongside the existing monthly quota columns.
 * checkAndIncrementQuota() handles both limits in a single DB round-trip.
 *
 * This file can be deleted. It is kept as a tombstone to make the removal
 * visible in git history.
 */
