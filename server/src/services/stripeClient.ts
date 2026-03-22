/**
 * stripeClient.ts
 *
 * Singleton Stripe SDK instance.
 * Secret key is read from STRIPE_SECRET_KEY env var — never exposed to the client.
 *
 * If the key is absent (e.g. local dev without Stripe configured), the module
 * initialises with a placeholder so the server doesn't crash at boot; any
 * endpoint that actually uses Stripe will detect the placeholder and return a
 * 503 with a clear message rather than a cryptic Stripe authentication error.
 */

import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey || secretKey === "sk_test_placeholder") {
  console.warn(
    "[stripe] STRIPE_SECRET_KEY is not configured — checkout endpoints will return 503.\n" +
    "         Set STRIPE_SECRET_KEY in server/.env to enable billing."
  );
}

export const stripe = new Stripe(secretKey || "sk_test_placeholder", {
  apiVersion: "2024-06-20" as any,
  typescript: true,
});

export const stripeConfigured = !!secretKey && secretKey !== "sk_test_placeholder";
