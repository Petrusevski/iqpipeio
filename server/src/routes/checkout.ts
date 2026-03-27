/**
 * checkout.ts  —  IQPIPE BILLING ONLY
 *
 * Endpoints:  GET  /api/checkout/prices
 *             POST /api/checkout/session
 *             GET  /api/checkout/confirm
 *             POST /api/checkout/webhook
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  THIS FILE IS IQPIPE BILLING — NOT THE USER STRIPE DATA SOURCE.             ║
 * ║                                                                             ║
 * ║  It exclusively uses billingStripe (IQPipe's own Stripe account) loaded     ║
 * ║  from STRIPE_SECRET_KEY.  It never reads IntegrationConnection records      ║
 * ║  and never touches user-provided Stripe credentials.                        ║
 * ║                                                                             ║
 * ║  For the user Stripe data-source pipeline see:                              ║
 * ║    server/src/routes/webhooks.ts        (router.post "/stripe")             ║
 * ║    server/src/routes/integrations.ts    (providerCheckers.stripe)           ║
 * ║    server/src/services/syncService.ts   (syncStripe)                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Security model:
 *  - STRIPE_SECRET_KEY lives only in server/.env — never reaches the browser.
 *  - STRIPE_WEBHOOK_SECRET verifies every inbound Stripe event signature.
 *    Unsigned events are rejected outright in production.
 *  - Card details are entered on stripe.com (PCI DSS Level 1) — never here.
 *  - workspaceId is embedded in Stripe metadata and re-verified on the webhook
 *    against the authenticated user's membership — cannot be spoofed.
 */

import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { billingStripe, billingStripeConfigured } from "../services/stripeClient";
import { PLAN_CONFIGS, planByPriceId } from "../config/stripePrices";
import { notifyWorkspace } from "../utils/webPush";

const router = Router();

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const CLIENT_ORIGIN  = process.env.CLIENT_ORIGIN || "http://localhost:5173";

// ─── Guard: return 503 if Stripe is not configured ───────────────────────────

function requireStripe(res: Response): boolean {
  if (!billingStripeConfigured) {
    res.status(503).json({
      error: "Billing is not configured on this server.",
      detail: "Set STRIPE_SECRET_KEY in your server environment variables.",
    });
    return false;
  }
  return true;
}

// ─── GET /api/checkout/prices ─────────────────────────────────────────────────
// Public endpoint — returns pricing display data only (no secret keys).

router.get("/prices", (_req: Request, res: Response) => {
  const plans = Object.values(PLAN_CONFIGS).map(({ planKey, displayName, monthlyPrice, yearlyPrice, seatLimit, workspaceLimit, eventLimit }) => ({
    planKey, displayName, monthlyPrice, yearlyPrice, seatLimit, workspaceLimit, eventLimit,
    // Never include Price IDs here — they are only consumed server-side
  }));
  return res.json({ plans });
});

// ─── GET /api/checkout/confirm?session_id=xxx ────────────────────────────────
// Polled by CheckoutSuccessPage to confirm the session and return the active plan.
// Uses the Stripe session to find the workspace — no user-supplied workspaceId needed.

router.get("/confirm", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireStripe(res)) return;

  const sessionId = String(req.query.session_id || "");
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return res.status(400).json({ error: "Invalid session_id." });
  }

  try {
    const session = await billingStripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return res.json({ confirmed: false });
    }

    const workspaceId = session.metadata?.workspaceId;
    if (!workspaceId) return res.json({ confirmed: false });

    // Verify the authenticated user belongs to this workspace
    const membership = await prisma.workspaceUser.findFirst({
      where: { userId: req.user!.id, workspaceId },
    });
    if (!membership) return res.status(403).json({ error: "Forbidden." });

    const workspace = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { plan: true },
    });

    return res.json({ confirmed: true, plan: workspace?.plan ?? session.metadata?.planId });
  } catch (err: any) {
    console.error("[checkout/confirm]", err.message);
    return res.status(500).json({ error: "Failed to confirm session." });
  }
});

// ─── POST /api/checkout/session ───────────────────────────────────────────────
// Authenticated. Creates a Stripe Checkout Session and returns its URL.
// Body: { planId: "starter"|"growth"|"agency", billing: "monthly"|"yearly" }

router.post("/session", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireStripe(res)) return;

  const { planId, billing } = req.body as { planId?: string; billing?: string };

  if (!planId || !PLAN_CONFIGS[planId]) {
    return res.status(400).json({ error: "Invalid planId. Must be: starter, growth, agency." });
  }
  if (!billing || !["monthly", "yearly"].includes(billing)) {
    return res.status(400).json({ error: "billing must be 'monthly' or 'yearly'." });
  }

  const plan    = PLAN_CONFIGS[planId];
  const priceId = billing === "yearly" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;

  if (!priceId) {
    return res.status(503).json({
      error: `Stripe Price ID for ${planId}/${billing} is not configured.`,
      detail: `Set STRIPE_PRICE_${planId.toUpperCase()}_${billing.toUpperCase()} in server/.env.`,
    });
  }

  try {
    // Resolve the user's primary workspace
    const membership = await prisma.workspaceUser.findFirst({
      where:   { userId: req.user!.id },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      return res.status(404).json({ error: "No workspace found for this account." });
    }

    const workspace = membership.workspace;

    // Create or reuse a Stripe Customer for this workspace
    let customerId = workspace.stripeCustomerId ?? undefined;

    if (!customerId) {
      const customer = await billingStripe.customers.create({
        email: workspace.billingEmail || req.user!.email,
        name:  workspace.name,
        metadata: {
          workspaceId: workspace.id,
          iqpipeUserId: req.user!.id,
        },
      });
      customerId = customer.id;

      await prisma.workspace.update({
        where: { id: workspace.id },
        data:  { stripeCustomerId: customerId },
      });
    }

    // Create the Checkout Session (hosted on stripe.com — no card data touches our server)
    const session = await billingStripe.checkout.sessions.create({
      mode:     "subscription",
      customer: customerId,

      line_items: [
        { price: priceId, quantity: 1 },
      ],

      // Embed workspace info so the webhook can act without a workspaceId query param
      subscription_data: {
        metadata: {
          workspaceId: workspace.id,
          planId,
          billing,
        },
        // No trial_period_days — omitting it means charge immediately
      },

      metadata: {
        workspaceId: workspace.id,
        planId,
        billing,
      },

      // Allow customers to apply discount codes you create in the Stripe Dashboard
      allow_promotion_codes: true,

      // Collect billing address for tax / VAT compliance (Estonia-based entity)
      billing_address_collection: "required",

      // Pre-fill their email
      customer_email: customerId ? undefined : (workspace.billingEmail || req.user!.email),

      // Where to redirect after Stripe Checkout completes
      success_url: `${CLIENT_ORIGIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${CLIENT_ORIGIN}/checkout/cancel`,
    });

    return res.json({ url: session.url });

  } catch (err: any) {
    console.error("[checkout/session]", err.message);
    return res.status(500).json({ error: "Failed to create checkout session.", detail: err.message });
  }
});

// ─── POST /api/checkout/webhook ───────────────────────────────────────────────
// Called directly by Stripe (not by our frontend).
// app.ts registers express.raw() for this path so req.body is a raw Buffer.
// Signature verification is mandatory in production.

router.post("/webhook", async (req: Request, res: Response) => {
  const sig     = req.headers["stripe-signature"] as string | undefined;
  const rawBody: Buffer = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body));

  let event: any;

  if (WEBHOOK_SECRET && sig) {
    try {
      event = billingStripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err: any) {
      console.error("[checkout/webhook] Signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook signature invalid: ${err.message}` });
    }
  } else {
    // Dev / no-webhook-secret fallback — only for local testing
    if (process.env.NODE_ENV === "production") {
      console.error("[checkout/webhook] STRIPE_WEBHOOK_SECRET is not set in production — rejecting.");
      return res.status(400).json({ error: "Webhook secret not configured." });
    }
    console.warn("[checkout/webhook] No webhook secret — skipping signature check (dev mode only).");
    try { event = JSON.parse(rawBody.toString()); } catch {
      return res.status(400).json({ error: "Invalid JSON body." });
    }
  }

  try {
    await handleStripeEvent(event);
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[checkout/webhook] Handler error:", err.message);
    return res.status(500).json({ error: "Webhook handler failed." });
  }
});

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleStripeEvent(event: any) {
  const type = event.type as string;
  const obj  = event.data?.object ?? {};

  switch (type) {

    // ── Checkout completed — activate subscription ──
    case "checkout.session.completed": {
      if (obj.mode !== "subscription") break;

      const workspaceId = obj.metadata?.workspaceId as string | undefined;
      const planId      = obj.metadata?.planId      as string | undefined;

      if (!workspaceId || !planId) {
        console.warn("[checkout/webhook] checkout.session.completed missing metadata — skipped.");
        break;
      }

      const subscriptionId = obj.subscription as string;
      const customerId     = obj.customer     as string;

      // Retrieve subscription to get price and period end
      const subscription = await billingStripe.subscriptions.retrieve(subscriptionId);
      const priceId      = subscription.items.data[0]?.price?.id ?? "";
      const periodEnd    = new Date((subscription as any).current_period_end * 1000);

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          plan:                    planId,
          stripeCustomerId:        customerId,
          stripeSubscriptionId:    subscriptionId,
          stripePriceId:           priceId,
          stripeCurrentPeriodEnd:  periodEnd,
          trialEndsAt:             null, // clear trial when subscription activates
        },
      });

      // Create an activity record so the invoice page picks it up
      await createBillingActivity(workspaceId, planId, obj.amount_total, obj.currency, subscriptionId);

      // Push notification: plan activated
      await notifyWorkspace(workspaceId, {
        title:     "iqpipe — subscription activated",
        body:      `Your ${PLAN_CONFIGS[planId]?.displayName ?? planId} plan is now active.`,
        url:       "/settings",
        eventType: "deal_won",
      }).catch(() => {});

      console.log(`[checkout/webhook] Workspace ${workspaceId} upgraded to plan: ${planId}`);
      break;
    }

    // ── Subscription updated (plan change, renewal, cancellation-at-period-end) ──
    case "customer.subscription.updated": {
      const subMeta = obj.metadata as Record<string, string> | undefined;
      const workspaceId = subMeta?.workspaceId;
      if (!workspaceId) break;

      const priceId   = obj.items?.data?.[0]?.price?.id ?? "";
      const plan      = planByPriceId(priceId);
      const periodEnd = new Date(obj.current_period_end * 1000);

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          plan:                   plan?.planKey ?? "growth",
          stripePriceId:          priceId,
          stripeCurrentPeriodEnd: periodEnd,
        },
      });
      break;
    }

    // ── Subscription cancelled / expired ──
    case "customer.subscription.deleted": {
      const subMeta = obj.metadata as Record<string, string> | undefined;
      const workspaceId = subMeta?.workspaceId;
      if (!workspaceId) break;

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          plan:                  "free",
          stripeSubscriptionId:  null,
          stripePriceId:         null,
          stripeCurrentPeriodEnd: null,
        },
      });

      // Notify the workspace
      await prisma.notification.create({
        data: {
          workspaceId,
          type:     "billing",
          title:    "Subscription cancelled",
          body:     "Your iqpipe subscription has been cancelled. Data ingestion is paused. Export your data within 30 days.",
          severity: "warning",
        },
      });

      console.log(`[checkout/webhook] Workspace ${workspaceId} downgraded to free.`);
      break;
    }

    // ── Successful invoice payment — record as invoice activity ──
    case "invoice.payment_succeeded": {
      const customerId = obj.customer as string;
      const subId      = obj.subscription as string | undefined;
      if (!customerId) break;

      const workspace = await prisma.workspace.findFirst({
        where: { stripeCustomerId: customerId },
      });
      if (!workspace) break;

      // Update billing period on renewal
      if (subId) {
        const sub = await billingStripe.subscriptions.retrieve(subId);
        await prisma.workspace.update({
          where: { id: workspace.id },
          data:  { stripeCurrentPeriodEnd: new Date((sub as any).current_period_end * 1000) },
        });
      }

      const amount   = ((obj.amount_paid ?? 0) / 100).toFixed(2);
      const currency = (obj.currency || "eur").toUpperCase();

      await createBillingActivity(workspace.id, workspace.plan, obj.amount_paid, obj.currency, obj.id);

      console.log(`[checkout/webhook] Invoice paid: ${currency} ${amount} for workspace ${workspace.id}`);
      break;
    }

    // ── Payment failed — alert the workspace ──
    case "invoice.payment_failed": {
      const customerId = obj.customer as string;
      if (!customerId) break;

      const workspace = await prisma.workspace.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      });
      if (!workspace) break;

      await prisma.notification.create({
        data: {
          workspaceId: workspace.id,
          type:     "billing",
          title:    "Payment failed",
          body:     "Your latest iqpipe payment could not be processed. Please update your payment method to avoid service interruption.",
          severity: "error",
        },
      });

      // Push notification: payment failure (high priority — always send)
      await notifyWorkspace(workspace.id, {
        title:     "iqpipe — payment failed",
        body:      "Your latest payment could not be processed. Please update your payment method.",
        url:       "/settings",
        eventType: "payment_failed",
      }).catch(() => {});

      break;
    }

    default:
      // Unhandled event type — safe to ignore
      break;
  }
}

// ─── Helper: write billing activity so InvoicesPage renders it ───────────────

async function createBillingActivity(
  workspaceId: string,
  planId: string,
  amountCents: number | null | undefined,
  currency: string | null | undefined,
  chargeId: string,
) {
  const amount   = ((amountCents ?? 0) / 100).toFixed(2);
  const curr     = (currency || "eur").toUpperCase();
  const planName = PLAN_CONFIGS[planId]?.displayName ?? planId;

  await prisma.activity.create({
    data: {
      workspaceId,
      type:    "deal_won",
      subject: chargeId,
      body: JSON.stringify({
        source:      "Stripe",
        amount,
        currency:    curr,
        description: `iqpipe ${planName} subscription`,
      }),
      status: "completed",
    },
  });
}

export default router;
