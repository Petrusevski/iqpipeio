/**
 * stripeClient.ts  —  IQPIPE BILLING ONLY
 *
 * This module owns IQPipe's own Stripe account credentials.
 * It is used exclusively for:
 *   - Creating Stripe Checkout Sessions for Starter/Growth/Agency plan purchases
 *   - Verifying Stripe billing webhook signatures (STRIPE_WEBHOOK_SECRET)
 *   - Retrieving subscription and customer data for IQPipe's own billing system
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  DO NOT import this file from any user-data pipeline code.                  ║
 * ║  User Stripe integration (data ingestion) must always instantiate its own   ║
 * ║  Stripe client using the user's encrypted key from IntegrationConnection,   ║
 * ║  never from this singleton.                                                 ║
 * ║                                                                             ║
 * ║  The exported names  billingStripe / billingStripeConfigured  are           ║
 * ║  intentionally prefixed "billing" to make misuse visible at a glance.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Key source:  STRIPE_SECRET_KEY  environment variable (IQPipe's Stripe account)
 * Webhook:     STRIPE_WEBHOOK_SECRET  (registerd at /api/checkout/webhook)
 */

import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey || secretKey === "sk_test_placeholder") {
  console.warn(
    "[iqpipe/billing] STRIPE_SECRET_KEY is not configured — checkout endpoints will return 503.\n" +
    "                 Set STRIPE_SECRET_KEY in server/.env to enable billing.\n" +
    "                 This is IQPipe's OWN billing key, NOT the user Stripe integration key."
  );
}

/**
 * The Stripe SDK client for IQPipe's billing operations.
 * Named `billingStripe` (not `stripe`) to prevent accidental use in user-data code.
 */
export const billingStripe = new Stripe(secretKey || "sk_test_placeholder", {
  apiVersion: "2024-06-20" as any,
  typescript:  true,
});

/**
 * True only when a real (non-placeholder) STRIPE_SECRET_KEY is configured.
 * Billing routes return 503 when this is false.
 */
export const billingStripeConfigured =
  !!secretKey && secretKey !== "sk_test_placeholder";
