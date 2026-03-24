import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import rateLimit from "express-rate-limit";

import leadsRouter from "./routes/leads";
import accountsRouter from "./routes/accounts";
import dealsRouter from "./routes/deals";
import workflowsRouter from "./routes/workflows";
import appsRouter from "./routes/apps";
import assistantRouter from "./routes/assistant";
import settingsRouter from "./routes/settings";
import authRouter from "./routes/auth";
import notificationsRouter from "./routes/notifications";
import dashboardRouter from "./routes/dashboard";
import journeysRouter from "./routes/journeys";
import performanceRouter from "./routes/performance";
import activityRouter from "./routes/activity";
import workspaceRoutes from "./routes/workspaces";
import integrationRoutes from "./routes/integrations";
import vaultRoutes from "./routes/vault";
import experimentsRouter from "./routes/experiments";
import profileRouter from "./routes/profile";
import webhooksRouter from "./routes/webhooks";
import icpRouter from "./routes/icp";
import invoicesRouter from "./routes/invoices";
import attributionRouter from "./routes/attribution";
import signalHealthRouter from "./routes/signalHealth";
import overlapCheckRouter from "./routes/overlapCheck";
import devSeedRouter      from "./routes/devSeed";
import gtmReportRouter      from "./routes/gtmReport";
import reportsRouter        from "./routes/reports";
import workflowHealthRouter from "./routes/workflowHealth";
import workflowMapRouter    from "./routes/workflowMap";
import linkedInRouter       from "./routes/linkedin";
import proxyRouter          from "./routes/proxy";
import n8nWorkflowsRouter  from "./routes/n8nWorkflows";
import automationHealthRouter from "./routes/automationHealth";
import n8nConnectRouter from "./routes/n8nConnect";
import makeConnectRouter from "./routes/makeConnect";
import checkoutRouter from "./routes/checkout";
import pushRouter  from "./routes/push";
import adminRouter from "./routes/admin";

const app = express();

// ── Security headers ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins: (string | RegExp)[] = [
  "http://localhost:5173",
  /\.vercel\.app$/,
];
if (process.env.CLIENT_ORIGIN) allowedOrigins.push(process.env.CLIENT_ORIGIN);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// ── Raw body middleware for Stripe signature verification ─────────────────
// MUST be registered BEFORE express.json() — Stripe requires the raw Buffer.
// Two separate Stripe webhook paths; each serves a completely different system:

// [A] USER STRIPE DATA SOURCE — events from users' own Stripe accounts
//     Handler: server/src/routes/webhooks.ts  (router.post "/stripe")
//     Key:     User's sk_live_* from IntegrationConnection (encrypted DB)
//     Secret:  User's webhook secret from IntegrationConnection
//     URL:     /api/webhooks/stripe?workspaceId=<workspaceId>
app.use("/api/webhooks/stripe",  express.raw({ type: "application/json" }));

// [B] IQPIPE BILLING — Stripe Checkout for Starter/Growth/Agency subscriptions
//     Handler: server/src/routes/checkout.ts  (router.post "/webhook")
//     Key:     STRIPE_SECRET_KEY env var (IQPipe's own Stripe account)
//     Secret:  STRIPE_WEBHOOK_SECRET env var
//     URL:     /api/checkout/webhook  (registered in Stripe Dashboard → Webhooks)
app.use("/api/checkout/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "1mb" }));

// ── Rate limiting ─────────────────────────────────────────────────────────

// Auth endpoints: 10 attempts per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
});

// Integration connect/check: 30 per 15 min
const integrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

// General API fallback: 200 per minute
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth", authLimiter);
app.use("/api/integrations", integrationLimiter);
app.use("/api", generalLimiter);

// ── Static files (snapshots) ──────────────────────────────────────────────
app.use("/public", express.static(path.join(__dirname, "../../public"), {
  maxAge: "1d",
  setHeaders: (res) => {
    res.set("Access-Control-Allow-Origin", "*");
  },
}));

// ── Healthcheck ───────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "revenuela-backend" });
});

// ── API routes ────────────────────────────────────────────────────────────
app.use("/api/leads", leadsRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/apps", appsRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/auth", authRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/journeys", journeysRouter);
app.use("/api/performance", performanceRouter);
app.use("/api/activity", activityRouter);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/vault", vaultRoutes);
// experiments route disabled — A/B testing removed
// app.use("/api/experiments", experimentsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/icp", icpRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/attribution", attributionRouter);
app.use("/api/signal-health", signalHealthRouter);
app.use("/api/overlap-check", overlapCheckRouter);
app.use("/api/dev",          devSeedRouter);
app.use("/api/gtm-report",      gtmReportRouter);
app.use("/api/reports",         reportsRouter);
app.use("/api/workflow-health", workflowHealthRouter);
app.use("/api/workflow-map",    workflowMapRouter);
app.use("/api/linkedin",       linkedInRouter);
app.use("/api/proxy",          proxyRouter);
app.use("/api/n8n",            n8nWorkflowsRouter);
app.use("/api/automation-health", automationHealthRouter);
app.use("/api/n8n-connect",   n8nConnectRouter);
app.use("/api/make-connect", makeConnectRouter);
app.use("/api/checkout",      checkoutRouter);
app.use("/api/push",         pushRouter);
app.use("/api/admin",        adminRouter);

export default app;
