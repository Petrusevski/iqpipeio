/**
 * stripeKeyGuard.ts
 *
 * Runtime enforcement of key isolation between the two Stripe systems in IQPipe:
 *
 *  ┌─────────────────────────────────────────────────────────────────────────────┐
 *  │  SYSTEM A — IQPipe Billing (Stripe Checkout)                                │
 *  │    Key source:  process.env.STRIPE_SECRET_KEY  (IQPipe's own Stripe acct)  │
 *  │    Webhook:     /api/checkout/webhook          (STRIPE_WEBHOOK_SECRET)      │
 *  │    Purpose:     Charging iqpipe customers for Starter/Growth/Agency plans   │
 *  │    Code:        server/src/services/stripeClient.ts                         │
 *  │                 server/src/routes/checkout.ts                               │
 *  │                 server/src/config/stripePrices.ts                           │
 *  ├─────────────────────────────────────────────────────────────────────────────┤
 *  │  SYSTEM B — User Stripe Data Source                                         │
 *  │    Key source:  IntegrationConnection.authData (user's own Stripe acct)     │
 *  │    Webhook:     /api/webhooks/stripe?workspaceId=xxx  (user's secret)       │
 *  │    Purpose:     Ingesting user's revenue events (charge.succeeded etc.)     │
 *  │                 into IQPipe's Live Feed / pipeline                          │
 *  │    Code:        server/src/routes/webhooks.ts   (router.post "/stripe")     │
 *  │                 server/src/routes/integrations.ts (stripe providerChecker)  │
 *  │                 server/src/services/syncService.ts (syncStripe)             │
 *  └─────────────────────────────────────────────────────────────────────────────┘
 *
 * INVARIANT: A key belonging to System A must NEVER be used by System B, and
 *            vice versa. These functions enforce that at runtime.
 */

/**
 * Called in System B (user-data) code paths before any Stripe SDK call.
 * Throws a hard error if the user-supplied key is identical to IQPipe's own
 * billing key — meaning the user accidentally pasted the wrong key.
 *
 * @param userKey   The API key the user provided in their integration settings.
 * @param context   A short label for logging (e.g. "webhook/stripe-data-source").
 */
export function assertNotBillingKey(userKey: string, context: string): void {
  const billingKey = process.env.STRIPE_SECRET_KEY;

  if (!billingKey || billingKey === "sk_test_placeholder") {
    // Billing is not configured — nothing to guard against.
    return;
  }

  if (userKey.trim() === billingKey.trim()) {
    // Hard stop — log a security warning before throwing.
    console.error(
      `[SECURITY] stripeKeyGuard: ${context} attempted to use IQPipe's billing ` +
      `Stripe key as a user data-source key. These must be different Stripe accounts. ` +
      `Rejecting request.`
    );
    throw new Error(
      "The Stripe API key you provided matches IQPipe's internal billing key. " +
      "You must use a separate Stripe account (your own) to connect as a data source. " +
      "Contact support if you need help."
    );
  }
}

/**
 * Called in System A (billing) code paths as a sanity check.
 * Verifies the key in use actually comes from the environment, not from any
 * user-supplied data. Pass the key about to be used; if it matches no env var
 * it is considered a leaked user key and the call is aborted.
 *
 * In practice this is a defence-in-depth check — System A already always reads
 * from `billingStripe` (the singleton), so this should never fire. But if it
 * does fire, it means something upstream went wrong and we want to know early.
 */
export function assertIsBillingKey(keyInUse: string, context: string): void {
  const billingKey = process.env.STRIPE_SECRET_KEY;

  if (!billingKey || billingKey === "sk_test_placeholder") {
    return; // not configured — skip
  }

  if (keyInUse.trim() !== billingKey.trim()) {
    console.error(
      `[SECURITY] stripeKeyGuard: ${context} is using a key that does not match ` +
      `STRIPE_SECRET_KEY. This could indicate a user credential leak into billing code.`
    );
    throw new Error("Billing operation aborted: key mismatch (security guard).");
  }
}

/**
 * Validates that a user-supplied Stripe key has the correct format for a
 * secret key (sk_live_ or sk_test_) and is not an obviously wrong value.
 * Does NOT make network calls — format check only.
 */
export function validateUserStripeKeyFormat(key: string): { valid: boolean; reason?: string } {
  const trimmed = key.trim();

  if (!trimmed.startsWith("sk_live_") && !trimmed.startsWith("sk_test_")) {
    return { valid: false, reason: "Stripe secret keys must start with sk_live_ or sk_test_" };
  }

  if (trimmed.length < 32) {
    return { valid: false, reason: "Key appears too short to be a valid Stripe secret key" };
  }

  const billingKey = process.env.STRIPE_SECRET_KEY;
  if (billingKey && billingKey !== "sk_test_placeholder" && trimmed === billingKey.trim()) {
    return {
      valid: false,
      reason: "This key is reserved for IQPipe billing. Please use your own Stripe account key.",
    };
  }

  return { valid: true };
}
