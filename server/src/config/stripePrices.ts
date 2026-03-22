/**
 * stripePrices.ts
 *
 * Central mapping of iqpipe plans → Stripe Price IDs.
 *
 * HOW TO FILL THIS IN:
 *  1. Go to Stripe Dashboard → Products → Add Product
 *  2. Create a product for each plan (Starter, Growth, Agency)
 *  3. For each product, create two recurring prices: monthly + yearly
 *  4. Copy the Price IDs (format: price_XXXXXXXXXXXXXXXXXXXXXX)
 *  5. Add them to server/.env as the variables below
 *
 * TEST MODE: Use test-mode Price IDs (created in test mode dashboard)
 * LIVE MODE: Create separate live-mode prices and swap the env vars
 *
 * Seat limits are enforced at application level only — not by Stripe.
 */

export interface PlanConfig {
  planKey: string;              // matches Workspace.plan values
  displayName: string;
  monthlyPrice: number;         // USD/EUR per month (for display)
  yearlyPrice: number;          // USD/EUR per month when billed annually
  stripePriceIdMonthly: string; // from STRIPE_PRICE_STARTER_MONTHLY etc.
  stripePriceIdYearly: string;
  seatLimit: number | null;     // null = unlimited
  workspaceLimit: number | null;
  eventLimit: number | null;    // monthly events, null = unlimited
}

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  starter: {
    planKey:              "starter",
    displayName:          "Starter",
    monthlyPrice:         29,
    yearlyPrice:          23,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || "",
    stripePriceIdYearly:  process.env.STRIPE_PRICE_STARTER_YEARLY  || "",
    seatLimit:            1,
    workspaceLimit:       1,
    eventLimit:           10_000,
  },
  growth: {
    planKey:              "growth",
    displayName:          "Growth",
    monthlyPrice:         99,
    yearlyPrice:          79,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY || "",
    stripePriceIdYearly:  process.env.STRIPE_PRICE_GROWTH_YEARLY  || "",
    seatLimit:            3,
    workspaceLimit:       3,
    eventLimit:           500_000,
  },
  agency: {
    planKey:              "agency",
    displayName:          "Agency",
    monthlyPrice:         299,
    yearlyPrice:          239,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY || "",
    stripePriceIdYearly:  process.env.STRIPE_PRICE_AGENCY_YEARLY  || "",
    seatLimit:            null,
    workspaceLimit:       null,
    eventLimit:           null,
  },
};

/** Return the PlanConfig for a given Stripe Price ID (reverse lookup). */
export function planByPriceId(priceId: string): PlanConfig | null {
  return (
    Object.values(PLAN_CONFIGS).find(
      (p) => p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId
    ) ?? null
  );
}
