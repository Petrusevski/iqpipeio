/**
 * integrations.ts  —  USER DATA-SOURCE INTEGRATIONS (NOT IQPIPE BILLING)
 *
 * Manages workspace integration connections (Clay, HubSpot, Stripe, etc.).
 * When "Stripe" appears here it refers to a USER's own Stripe account being
 * connected as a revenue data source — NOT IQPipe's billing/checkout system.
 *
 * Key isolation: assertNotBillingKey() is called before any Stripe SDK usage
 * to prevent cross-contamination between user data-source keys and IQPipe's
 * STRIPE_SECRET_KEY billing key.
 */

import { Router, Request, Response } from "express";
import { prisma } from "../db";
import axios from "axios";
import Stripe from "stripe";
import { encrypt, decrypt } from "../utils/encryption";
import * as heyReachService from "../services/heyreach";
import { createNotification } from "../services/notificationService";
import { assertNotBillingKey, validateUserStripeKeyFormat } from "../utils/stripeKeyGuard";
import {
  syncApollo, syncHeyReach, syncLemlist, syncInstantly, syncSmartlead,
  syncStripe, syncAllWorkspaces,
} from "../services/syncService";

const router = Router();

type ProviderStatus = "connected" | "not_connected";

type AuthData = {
  apiKey?: string;
  accessToken?: string;
  tableId?: string; 
  [key: string]: any;
};

// Helper to extract ID from URL
function extractClayID(input: string): { viewId: string | null, tableId: string | null } {
  if (!input) return { viewId: null, tableId: null };
  const cleanInput = input.trim();
  if (cleanInput.startsWith("http")) {
    const viewMatch = cleanInput.match(/(gv_[a-zA-Z0-9]+)/);
    const tableMatch = cleanInput.match(/(t_[a-zA-Z0-9]+)/);
    return { viewId: viewMatch ? viewMatch[0] : null, tableId: tableMatch ? tableMatch[0] : null };
  }
  if (cleanInput.startsWith("gv_")) return { viewId: cleanInput, tableId: null };
  if (cleanInput.startsWith("t_")) return { viewId: null, tableId: cleanInput };
  return { viewId: null, tableId: cleanInput };
}

const parseAuthData = (raw?: string | null): AuthData | null => {
  if (!raw) return null;
  try {
    const decrypted = decrypt(raw);
    return JSON.parse(decrypted);
  } catch {
    // Do NOT fall back to plain JSON — if decryption fails, treat as missing
    return null;
  }
};

// Validate that incoming secrets are non-empty strings of reasonable length
function sanitizeSecrets(raw: Record<string, unknown>): AuthData {
  const out: AuthData = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.trim().length >= 8) {
      out[k] = v.trim();
    }
  }
  return out;
}

// Return type definition for checkers
type CheckerResult = { success: boolean; message?: string };

const providerCheckers: Record<
  string,
  (auth: AuthData | null) => Promise<CheckerResult>
> = {
  // USER STRIPE DATA SOURCE — validates the user's own Stripe key.
  // This checker must NEVER use billingStripe or STRIPE_SECRET_KEY.
  stripe: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };

    // Format + billing-key isolation check (no network call needed for this)
    const fmt = validateUserStripeKeyFormat(auth.apiKey);
    if (!fmt.valid) return { success: false, message: fmt.reason ?? "Invalid Stripe key format." };

    try {
      // Guard: reject if user accidentally provided IQPipe's billing key
      assertNotBillingKey(auth.apiKey, "integrations/stripe-checker");

      // Use a throwaway Stripe instance scoped to the USER's key only
      const userStripe = new Stripe(auth.apiKey.trim(), { apiVersion: "2024-06-20" as any });
      await userStripe.balance.retrieve();
      return { success: true };
    } catch (e: any) {
      if (e.message?.includes("reserved for IQPipe billing")) {
        return { success: false, message: e.message };
      }
      return { success: false, message: e.message };
    }
  },

  // ✅ FIXED: HeyReach Checker now uses POST
  heyreach: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      // 405 Error Fix: Changed GET to POST
      await axios.post("https://api.heyreach.io/api/public/campaign/GetAll", {}, {
        headers: { "X-API-KEY": auth.apiKey.trim() }
      });
      return { success: true };
    } catch (e: any) {
      const msg = e.response?.data?.message || e.message;
      console.error("HeyReach Check Error:", e.response?.status, msg);
      return { success: false, message: "Invalid API Key or Connection Error" };
    }
  },

  clay: async (auth) => {
    if (!auth?.apiKey || !auth?.tableId) return { success: false, message: "Missing API Key or Table ID" };

    const apiKey = auth.apiKey.trim();
    const { viewId, tableId } = extractClayID(auth.tableId);
    const headers = { "X-API-Key": apiKey };

    if (viewId) {
      try {
        await axios.get(`https://api.clay.com/v3/views/${viewId}/records?limit=1`, { headers });
        return { success: true };
      } catch (e: any) {}
    }
    if (tableId) {
      try {
        await axios.get(`https://api.clay.com/v3/tables/${tableId}/records?limit=1`, { headers });
        return { success: true };
      } catch (e: any) {}
    }
    try {
      await axios.get(`https://api.clay.com/v3/workspaces`, { headers });
      return { success: true };
    } catch (e: any) {
      return { success: false, message: "Clay Error" };
    }
  },

  apollo: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get(
        "https://api.apollo.io/api/v1/auth/health",
        {
          headers: { "X-Api-Key": auth.apiKey.trim() },
          validateStatus: (s) => s < 500,
        }
      );
      if (res.data?.is_logged_in === true) return { success: true };
      return { success: false, message: res.data?.error || "Invalid API Key" };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  lusha: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get("https://api.lusha.com/v2/person", {
        headers: { Authorization: `Bearer ${auth.apiKey.trim()}` },
        params: { email: "auth-check@revenuela.io" },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401) return { success: false, message: "Invalid API Key" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  phantombuster: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      await axios.get("https://api.phantombuster.com/api/v2/agents/fetch-all", {
        headers: { "x-phantombuster-key": auth.apiKey.trim() },
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.error || e.message };
    }
  },

  clearbit: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      await axios.get("https://person.clearbit.com/v2/people/find?email=test@clearbit.com", {
        auth: { username: auth.apiKey.trim(), password: "" },
        validateStatus: (s) => s === 404 || s === 200 || s === 422,
      });
      return { success: true };
    } catch (e: any) {
      if (e.response?.status === 401) return { success: false, message: "Invalid API Key" };
      return { success: false, message: e.message };
    }
  },

  cognism: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get("https://api.cognism.com/v1/lists", {
        headers: { Authorization: `Bearer ${auth.apiKey.trim()}` },
        validateStatus: (s) => s < 500,
      });
      // 401 = bad key; 403 may be Cloudflare WAF (key accepted, IP restricted) — treat as connected
      if (res.status === 401) return { success: false, message: "Invalid API Key" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  zoominfo: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key (username)" };
    if (!auth?.accessToken) return { success: false, message: "Missing password/token" };
    try {
      const res = await axios.post(
        "https://api.zoominfo.com/authenticate",
        { username: auth.apiKey.trim(), password: auth.accessToken.trim() },
        { headers: { "Content-Type": "application/json" } }
      );
      return res.data?.jwt ? { success: true } : { success: false, message: "Authentication failed" };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  hunter: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get(`https://api.hunter.io/v2/account?api_key=${auth.apiKey.trim()}`);
      return res.data?.data ? { success: true } : { success: false, message: "Invalid API Key" };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.errors?.[0]?.details || e.message };
    }
  },

  smartlead: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get(`https://server.smartlead.ai/api/v1/client?api_key=${auth.apiKey.trim()}`);
      return res.data ? { success: true } : { success: false, message: "Invalid API Key" };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  instantly: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get(`https://api.instantly.ai/api/v1/authenticate?api_key=${auth.apiKey.trim()}`);
      return res.data?.status === "1" ? { success: true } : { success: false, message: "Invalid API Key" };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.error || e.message };
    }
  },

  lemlist: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      await axios.get("https://api.lemlist.com/api/team", {
        auth: { username: "", password: auth.apiKey.trim() },
      });
      return { success: true };
    } catch (e: any) {
      if (e.response?.status === 401) return { success: false, message: "Invalid API Key" };
      return { success: false, message: e.message };
    }
  },

  replyio: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      await axios.get("https://api.reply.io/v1/people", {
        headers: { "x-api-key": auth.apiKey.trim() },
        params: { page: 1, limit: 1 },
        validateStatus: (s) => s < 500,
      });
      return { success: true };
    } catch (e: any) {
      if (e.response?.status === 401) return { success: false, message: "Invalid API Key" };
      return { success: false, message: e.message };
    }
  },

  paddle: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      await axios.get("https://api.paddle.com/products", {
        headers: { Authorization: `Bearer ${auth.apiKey.trim()}` },
        params: { per_page: 1 },
      });
      return { success: true };
    } catch (e: any) {
      if (e.response?.status === 401) return { success: false, message: "Invalid API Key" };
      return { success: false, message: e.response?.data?.error?.detail || e.message };
    }
  },

  chargebee: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    if (!auth?.tableId) return { success: false, message: "Missing Site Name" };
    try {
      await axios.get(`https://${auth.tableId.trim()}.chargebee.com/api/v2/subscriptions`, {
        auth: { username: auth.apiKey.trim(), password: "" },
        params: { limit: 1 },
      });
      return { success: true };
    } catch (e: any) {
      if (e.response?.status === 401) return { success: false, message: "Invalid API Key or Site Name" };
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  lemonsqueezy: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      await axios.get("https://api.lemonsqueezy.com/v1/stores", {
        headers: { Authorization: `Bearer ${auth.apiKey.trim()}` },
      });
      return { success: true };
    } catch (e: any) {
      if (e.response?.status === 401) return { success: false, message: "Invalid API Key" };
      return { success: false, message: e.message };
    }
  },

  // ── LinkedIn outreach ────────────────────────────────────────────────────

  expandi: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get("https://expandi.io/api/v1/campaigns", {
        headers: { "X-Authorization": auth.apiKey.trim() },
        params: { limit: 1 },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401 || res.status === 403) return { success: false, message: "Invalid API Key" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  dripify: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get("https://api.dripify.io/api/v1/user", {
        headers: { Authorization: `Bearer ${auth.apiKey.trim()}` },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401) return { success: false, message: "Invalid API Key" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  // Waalaxy uses OAuth — credential existence check only
  waalaxy: async (auth) => {
    if (!auth?.apiKey && !auth?.accessToken) return { success: false, message: "Missing credentials" };
    return { success: true };
  },

  // Meet Alfred uses email + password or API key — credential existence check
  meetalfred: async (auth) => {
    if (!auth?.apiKey && !auth?.accessToken) return { success: false, message: "Missing credentials" };
    return { success: true };
  },

  // ── Cold email ───────────────────────────────────────────────────────────

  mailshake: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get("https://api.mailshake.com/2018-04-01/me", {
        headers: { "X-API-KEY": auth.apiKey.trim() },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401) return { success: false, message: "Invalid API Key" };
      return res.data ? { success: true } : { success: false, message: "Invalid API Key" };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  // ── Phone / calling ─────────────────────────────────────────────────────

  aircall: async (auth) => {
    // Aircall uses Basic auth: API ID as username, API Token as password
    if (!auth?.apiKey || !auth?.accessToken) return { success: false, message: "Missing API ID or API Token" };
    try {
      const res = await axios.get("https://api.aircall.io/v1/users", {
        auth: { username: auth.apiKey.trim(), password: auth.accessToken.trim() },
        params: { per_page: 1 },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401) return { success: false, message: "Invalid API ID or Token" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  // Dialpad uses OAuth — credential existence check
  dialpad: async (auth) => {
    if (!auth?.apiKey && !auth?.accessToken) return { success: false, message: "Missing credentials" };
    return { success: true };
  },

  // Kixie — credential existence check (API is partner-only)
  kixie: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    return { success: true };
  },

  // Orum — credential existence check (API requires enterprise contract)
  orum: async (auth) => {
    if (!auth?.apiKey && !auth?.accessToken) return { success: false, message: "Missing credentials" };
    return { success: true };
  },

  // ── SMS / WhatsApp ───────────────────────────────────────────────────────

  twilio: async (auth) => {
    // Twilio uses Account SID + Auth Token (both required)
    if (!auth?.apiKey) return { success: false, message: "Missing Account SID" };
    if (!auth?.accessToken) return { success: false, message: "Missing Auth Token" };
    try {
      const res = await axios.get(
        `https://api.twilio.com/2010-04-01/Accounts/${auth.apiKey.trim()}.json`,
        { auth: { username: auth.apiKey.trim(), password: auth.accessToken.trim() }, validateStatus: (s) => s < 500 }
      );
      if (res.status === 401) return { success: false, message: "Invalid Account SID or Auth Token" };
      return res.data?.status === "active" ? { success: true } : { success: false, message: "Account not active" };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  sakari: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get("https://api.sakari.io/v1/accounts", {
        headers: { Authorization: `Bearer ${auth.apiKey.trim()}` },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401) return { success: false, message: "Invalid API Key" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  // WATI — credential existence check (requires tenant-specific endpoint)
  wati: async (auth) => {
    if (!auth?.apiKey && !auth?.accessToken) return { success: false, message: "Missing credentials" };
    return { success: true };
  },

  // ── Multichannel outreach ────────────────────────────────────────────────

  outreach: async (auth) => {
    if (!auth?.accessToken) return { success: false, message: "Missing Access Token" };
    try {
      const res = await axios.get("https://api.outreach.io/api/v2/prospects", {
        headers: { Authorization: `Bearer ${auth.accessToken.trim()}` },
        params: { "page[size]": 1 },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401) return { success: false, message: "Invalid or expired Access Token" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.errors?.[0]?.title || e.message };
    }
  },

  salesloft: async (auth) => {
    if (!auth?.accessToken) return { success: false, message: "Missing Access Token" };
    try {
      const res = await axios.get("https://api.salesloft.com/v2/me.json", {
        headers: { Authorization: `Bearer ${auth.accessToken.trim()}` },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401) return { success: false, message: "Invalid or expired Access Token" };
      return res.data?.data ? { success: true } : { success: false, message: "Invalid token" };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.error?.message || e.message };
    }
  },

  klenty: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get("https://app.klenty.com/apis/v1/user/prospects", {
        headers: { "x-API-Key": auth.apiKey.trim() },
        params: { Page: 1, Count: 1 },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401 || res.status === 403) return { success: false, message: "Invalid API Key" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  // ── CRM ──────────────────────────────────────────────────────────────────

  hubspot: async (auth) => {
    if (!auth?.accessToken) return { success: false, message: "Missing Private App Access Token" };
    try {
      const res = await axios.get("https://api.hubapi.com/crm/v3/objects/contacts", {
        headers: { Authorization: `Bearer ${auth.accessToken.trim()}` },
        params: { limit: 1 },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401 || res.status === 403) return { success: false, message: "Invalid or expired access token — regenerate in HubSpot Private Apps." };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || e.message };
    }
  },

  pipedrive: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Token" };
    try {
      const res = await axios.get("https://api.pipedrive.com/v1/users/me", {
        params: { api_token: auth.apiKey.trim() },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401 || !res.data?.success) return { success: false, message: "Invalid API Token" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.error || e.message };
    }
  },

  salesforce: async (auth) => {
    if (!auth?.clientId || !auth?.clientSecret) return { success: false, message: "Missing Client ID or Client Secret" };
    if (!auth?.instanceUrl) return { success: false, message: "Missing Instance URL" };
    try {
      const res = await axios.get(`${auth.instanceUrl.trim()}/services/data`, {
        validateStatus: (s) => s < 500,
        timeout: 6000,
      });
      if (res.status === 404 || res.status === 503) return { success: false, message: "Could not reach Salesforce instance — check your Instance URL." };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: "Could not reach Salesforce instance — check your Instance URL." };
    }
  },

  // ── Enrichment (additional) ───────────────────────────────────────────────

  pdl: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get("https://api.peopledatalabs.com/v5/person/enrich", {
        headers: { "X-Api-Key": auth.apiKey.trim() },
        params: { email: "auth-check@peopledatalabs.com" },
        validateStatus: (s) => s === 200 || s === 404 || s === 402 || s === 401,
      });
      if (res.status === 401) return { success: false, message: "Invalid API Key" };
      if (res.status === 402) return { success: true }; // Key valid, credits exhausted
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.error?.message || e.message };
    }
  },

  snovio: async (auth) => {
    if (!auth?.apiKey || !auth?.accessToken) return { success: false, message: "Missing API User ID or API Secret" };
    try {
      const res = await axios.post(
        "https://api.snov.io/v1/oauth/access_token",
        { grant_type: "client_credentials", client_id: auth.apiKey.trim(), client_secret: auth.accessToken.trim() },
        { validateStatus: (s) => s < 500 },
      );
      if (res.status === 401 || !res.data?.access_token) return { success: false, message: "Invalid API User ID or Secret" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.error || e.message };
    }
  },

  rocketreach: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    try {
      const res = await axios.get("https://api.rocketreach.co/api/v2/account", {
        headers: { "Api-Key": auth.apiKey.trim() },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401 || res.status === 403) return { success: false, message: "Invalid API Key" };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.detail || e.message };
    }
  },

  // ── Automation Platforms ─────────────────────────────────────────────────

  n8n: async (auth) => {
    if (!auth?.instanceUrl) return { success: false, message: "Missing Instance URL" };
    if (!auth?.apiKey) return { success: false, message: "Missing API Key" };
    const base = auth.instanceUrl.trim().replace(/\/$/, "");
    try {
      const res = await axios.get(`${base}/api/v1/workflows`, {
        headers: { "X-N8N-API-KEY": auth.apiKey.trim() },
        params: { limit: 1 },
        validateStatus: (s) => s < 500,
        timeout: 8000,
      });
      if (res.status === 401 || res.status === 403) return { success: false, message: "Invalid API Key — check n8n Settings → API → API Keys." };
      if (res.status === 404) return { success: false, message: "n8n API not found at this URL — ensure the instance URL is correct and the n8n API is enabled." };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: "Could not reach n8n instance — verify the Instance URL is correct and accessible." };
    }
  },

  make: async (auth) => {
    if (!auth?.apiKey) return { success: false, message: "Missing API Token" };
    const region = (auth.tableId || "us1").trim();
    try {
      const res = await axios.get(`https://${region}.make.com/api/v2/users/me`, {
        headers: { Authorization: `Token ${auth.apiKey.trim()}` },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401 || res.status === 403) return { success: false, message: "Invalid API Token — check Make.com Account → API access." };
      return res.data?.id ? { success: true } : { success: false, message: "Could not authenticate with Make.com" };
    } catch (e: any) {
      return { success: false, message: e.response?.data?.message || "Could not reach Make.com — check your region (us1, eu1, eu2)." };
    }
  },
};

// ─── Silence Detection Config ────────────────────────────────────────────────

/** Hours of no events before we fire an alarm notification */
const TOOL_SILENCE_THRESHOLD: Record<string, number> = {
  // LinkedIn outreach — should fire every ≤12 h during business hours
  heyreach: 12, expandi: 12, dripify: 12, waalaxy: 12, meetalfred: 12,
  // Cold email outreach
  lemlist: 12, instantly: 12, smartlead: 12, mailshake: 12,
  // Phone / calling
  aircall: 12, dialpad: 12, kixie: 12, orum: 12,
  // SMS / WhatsApp
  twilio: 12, sakari: 12, wati: 12,
  // Multichannel
  replyio: 12, outreach: 12, salesloft: 12, klenty: 12,
  // Prospecting / Enrichment — daily jobs, alarm after 24 h
  clay: 24, apollo: 24, lusha: 24, clearbit: 24, cognism: 24,
  zoominfo: 24, phantombuster: 24, hunter: 24, pdl: 24,
  snovio: 24, rocketreach: 24,
  // CRM — synced on-demand, alarm after 48 h
  hubspot: 48, pipedrive: 48, salesforce: 48,
  // Billing — lower frequency, alarm after 48 h
  stripe: 48, paddle: 48, chargebee: 48, lemonsqueezy: 48,
  // Automation — fire on workflow completion, alarm after 12 h
  n8n: 12, make: 12,
};

const TOOL_SUGGESTIONS: Record<string, string[]> = {
  outreach: [
    "Check if your campaign or sequence is paused in the tool's dashboard.",
    "Verify your daily sending quota has not been exhausted.",
    "Confirm the account is not flagged for spam or under a sending restriction.",
    "Re-check API credentials in Revenuela's Integrations page.",
  ],
  enrichment: [
    "Your monthly lookup / API credit quota may have been fully consumed.",
    "Verify the API key is still valid and has not been revoked.",
    "Check your plan limits on the tool's billing page.",
    "Re-connect the integration in Revenuela if the key was rotated.",
  ],
  prospecting: [
    "The connected table or workflow may be paused (especially for Clay).",
    "Check your credit balance — enrichment credits may have run out.",
    "Verify API key validity and rate-limit status.",
    "Review the sync schedule — the source may not have new records.",
  ],
  crm: [
    "The OAuth token may have expired — reconnect the CRM in Integrations.",
    "Check OAuth permission scopes; a re-auth may be required after a plan change.",
    "Confirm API access is enabled on your CRM plan (some restrict it to higher tiers).",
    "Look for sync errors in your CRM's API log or activity feed.",
  ],
  billing: [
    "Webhook delivery may be failing — check your billing tool's webhook log.",
    "Verify the endpoint URL is accessible and returning HTTP 200.",
    "Confirm the SSL certificate on your server is valid.",
    "Review firewall rules; the billing provider's IP range may need to be allowed.",
  ],
};

const TOOL_CATEGORY_FOR_SILENCE: Record<string, string> = {
  // LinkedIn outreach
  heyreach: "outreach", expandi: "outreach", dripify: "outreach", waalaxy: "outreach", meetalfred: "outreach",
  // Cold email
  lemlist: "outreach", instantly: "outreach", smartlead: "outreach", mailshake: "outreach",
  // Phone / calling
  aircall: "outreach", dialpad: "outreach", kixie: "outreach", orum: "outreach",
  // SMS / WhatsApp
  twilio: "outreach", sakari: "outreach", wati: "outreach",
  // Multichannel
  replyio: "outreach", outreach: "outreach", salesloft: "outreach", klenty: "outreach",
  // Prospecting / enrichment
  clay: "prospecting", apollo: "prospecting", phantombuster: "prospecting",
  lusha: "enrichment", clearbit: "enrichment", cognism: "enrichment",
  zoominfo: "enrichment", hunter: "enrichment", pdl: "enrichment",
  snovio: "enrichment", rocketreach: "enrichment",
  // CRM
  hubspot: "crm", pipedrive: "crm", salesforce: "crm",
  // Billing
  stripe: "billing", paddle: "billing", chargebee: "billing", lemonsqueezy: "billing",
  // Automation
  n8n: "automation", make: "automation",
};

/** Same source normalizer as dashboard.ts — keep in sync */
function normSource(raw: string | null): string {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().trim();
  const KNOWN = [
    // LinkedIn outreach
    "heyreach","expandi","dripify","waalaxy","meetalfred",
    // Cold email
    "lemlist","instantly","smartlead","mailshake",
    // Phone / calling
    "aircall","dialpad","kixie","orum",
    // SMS / WhatsApp
    "twilio","sakari","wati",
    // Multichannel
    "replyio","outreach","salesloft","klenty",
    // Prospecting
    "clay","apollo","phantombuster",
    // Enrichment
    "clearbit","lusha","dropcontact","zoominfo","cognism","hunter","pdl","snovio","rocketreach",
    // CRM
    "hubspot","pipedrive","salesforce",
    // Billing
    "stripe","paddle","chargebee","lemonsqueezy",
  ];
  for (const k of KNOWN) { if (s.includes(k)) return k; }
  if (s.includes("people data") || s === "pdl") return "pdl";
  if (s.includes("snov") || s.includes("snovio")) return "snovio";
  if (s.includes("rocket") || s.includes("rocketreach")) return "rocketreach";
  if (s.includes("google") || s.includes("sheet")) return "google_sheets";
  return s.replace(/\s+/g, "_");
}

// --- ROUTES ---

router.get("/", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  const integrations = await prisma.integrationConnection.findMany({ where: { workspaceId } });
  return res.json(integrations.map((i) => ({
    provider: i.provider,
    status: i.status as ProviderStatus,
    hasAuth: !!i.authData,
  })));
});

router.post("/:provider/check", async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { workspaceId } = req.body; 

  if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });

  let conn = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider } });
  
  const rawIncoming = { ...req.body };
  delete rawIncoming.workspaceId;

  let authData = parseAuthData(conn?.authData ?? null);

  if (Object.keys(rawIncoming).length > 0) {
    authData = sanitizeSecrets(rawIncoming);
  }
  
  let result: CheckerResult = { success: false, message: "Unknown provider" };
  
  if (providerCheckers[provider]) {
    result = await providerCheckers[provider](authData);
  } else {
    if (authData && Object.values(authData).some(v => v && typeof v === 'string' && v.trim().length > 0)) {
        result = { success: true };
    } else {
        result = { success: false, message: "No credentials found" };
    }
  }

  const newStatus: ProviderStatus = result.success ? "connected" : "not_connected";

  if (!conn) {
    if (result.success) {
        conn = await prisma.integrationConnection.create({
            data: {
                workspaceId,
                provider,
                status: newStatus,
                authData: encrypt(JSON.stringify(authData)),
            },
        });
    }
  } else {
    const updateData: any = { status: newStatus };
    if (result.success && Object.keys(rawIncoming).length > 0) {
        updateData.authData = encrypt(JSON.stringify(authData));
    }
    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: updateData,
    });
  }

  if (!result.success) {
    return res.status(400).json({ 
      provider, 
      status: newStatus, 
      error: result.message 
    });
  }

  return res.json({ provider, status: newStatus, hasAuth: true });
});

router.post("/:provider/disconnect", async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { workspaceId } = req.body;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });
  const conn = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider } });
  if (conn) {
    await prisma.integrationConnection.update({ where: { id: conn.id }, data: { status: "not_connected", authData: null } });
  }
  return res.json({ provider, status: "not_connected", hasAuth: false });
});

// Sync function dispatch map.
// Outreach event tools (heyreach, lemlist, instantly, smartlead) are included
// here for manual one-time BACKFILL only — their ongoing events are delivered
// via webhooks (POST /api/webhooks/:provider) in real-time, not by polling.
const SYNC_FUNCTIONS: Record<string, (ws: string) => Promise<{ imported: number }>> = {
  // ── Contact / payment import (also runs in automated poll) ──
  apollo:    syncApollo,
  stripe:    syncStripe,
  // ── Outreach backfill (manual only — events delivered via webhook) ──
  heyreach:  syncHeyReach,
  lemlist:   syncLemlist,
  instantly: syncInstantly,
  smartlead: syncSmartlead,
};

const SYNC_SUPPORTED = ["clay", ...Object.keys(SYNC_FUNCTIONS)];

router.post("/:provider/sync", async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { workspaceId } = req.body;

  if (!SYNC_SUPPORTED.includes(provider)) {
    return res.status(400).json({ error: `Sync not supported for ${provider}.` });
  }

  const conn = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider } });
  const auth = parseAuthData(conn?.authData);
  if (!auth) return res.status(400).json({ error: "Missing credentials." });

  // ── Generic sync dispatch (Apollo, HeyReach, Lemlist, etc.) ──────────────
  const syncFn = SYNC_FUNCTIONS[provider];
  if (syncFn) {
    try {
      const { imported } = await syncFn(workspaceId);
      return res.json({ success: true, imported });
    } catch (error: any) {
      return res.status(500).json({ error: `${provider} sync failed`, details: error.message });
    }
  }

  // ── Clay Sync ────────────────────────────────────────────────────────────
  if (!auth.apiKey || !auth.tableId) return res.status(400).json({ error: "Missing credentials." });

  try {
    const apiKey = auth.apiKey.trim();
    const { viewId, tableId } = extractClayID(auth.tableId);
    const headers = { "X-API-Key": apiKey };
    let records: any[] = [];

    if (viewId) {
      try {
        const r = await axios.get(`https://api.clay.com/v3/views/${viewId}/records?limit=50`, { headers });
        records = r.data.records || r.data || [];
      } catch (e) {}
    }
    if (records.length === 0 && tableId) {
      try {
        const r = await axios.get(`https://api.clay.com/v3/tables/${tableId}/records?limit=50`, { headers });
        records = r.data.records || r.data || [];
      } catch (e) {}
    }

    if (records.length === 0) return res.status(400).json({ error: "Could not fetch records. Check ID or permissions." });

    let importedCount = 0;
    for (const record of records) {
      const fields   = record.fields || record;
      const email    = fields["Email"] || fields["email"] || fields["Work Email"];
      const linkedin = fields["LinkedIn"] || fields["LinkedIn URL"] || fields["Profile Link"];
      const name     = fields["Name"] || fields["Full Name"] || "Unknown";

      if (email || linkedin) {
        const [firstName, ...rest] = (typeof name === "string" ? name : "Unknown").split(" ");
        const lastName = rest.join(" ");
        const contactId = `clay-${record.id}`;

        await prisma.contact.upsert({
          where: { id: contactId },
          update: { firstName, lastName, email: email || undefined, linkedinUrl: linkedin || undefined },
          create: { id: contactId, workspaceId, email: email || null, linkedinUrl: linkedin || null, firstName, lastName, status: "prospect" },
        });

        const existingLead = await prisma.lead.findFirst({ where: { contactId } });
        if (!existingLead) {
          const lead = await prisma.lead.create({
            data: { workspaceId, contactId, status: "new", email: email || "", fullName: `${firstName} ${lastName}`.trim(), source: "Clay" },
          });
          await prisma.activity.create({
            data: {
              workspaceId, type: "lead_imported",
              subject: `${firstName} ${lastName}`.trim() || "Unknown",
              body: JSON.stringify({ source: "Clay", linkedinUrl: linkedin }),
              status: "completed", leadId: lead.id,
            },
          });
        }
        importedCount++;
      }
    }

    // Stamp lastSyncAt so the dashboard marks Clay as active
    const updatedAuth = { ...auth, lastSyncAt: new Date().toISOString() };
    await prisma.integrationConnection.update({
      where: { id: conn!.id },
      data: { authData: encrypt(JSON.stringify(updatedAuth)) },
    });

    return res.json({ success: true, imported: importedCount });
  } catch (error: any) {
    return res.status(500).json({ error: "Sync failed", details: error.message });
  }
});

// --- HEYREACH ROUTES ---

router.get("/heyreach/campaigns", async (req: Request, res: Response) => {
  const { workspaceId } = req.query;
  if (!workspaceId) return res.status(400).json({ error: "Missing workspaceId" });

  try {
    const conn = await prisma.integrationConnection.findFirst({
      where: { workspaceId: String(workspaceId), provider: "heyreach", status: "connected" }
    });

    if (!conn || !conn.authData) {
      return res.status(403).json({ error: "HeyReach not connected." });
    }

    const auth = parseAuthData(conn.authData);
    if (!auth?.apiKey) return res.status(403).json({ error: "Invalid credentials." });

    // ✅ FIXED: Changed GET to POST for Campaigns too
    const apiRes = await axios.post("https://api.heyreach.io/api/public/campaign/GetAll", {}, {
      headers: { "X-API-KEY": auth.apiKey.trim() }
    });

    const campaigns = apiRes.data?.payload || apiRes.data || [];
    return res.json({ campaigns });
  } catch (error: any) {
    console.error("HeyReach Campaigns Error:", error.response?.status, error.message);
    return res.status(500).json({ error: error.message });
  }
});

router.post("/heyreach/export", async (req: Request, res: Response) => {
  const { workspaceId, campaignId, leadIds } = req.body;

  if (!workspaceId || !campaignId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const conn = await prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: "heyreach" }
    });
    const auth = parseAuthData(conn?.authData);
    if (!auth?.apiKey) return res.status(403).json({ error: "HeyReach API Key missing." });

    const whereCondition = leadIds && leadIds.length > 0 
      ? { id: { in: leadIds }, workspaceId }
      : { workspaceId };

    const leads = await prisma.lead.findMany({ where: whereCondition });

    // Use the service function (which we assume uses POST already)
    const result = await heyReachService.exportLeadsToCampaign(auth.apiKey, campaignId, leads);

    return res.json(result);

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});


// POST /api/integrations/heyreach/setup-all-webhooks
// Creates one workspace-level webhook per event type in HeyReach (12 total).
// Empty campaignIds array = applies to ALL campaigns automatically.
// Endpoint confirmed from HeyReach docs: POST /api/public/webhooks/CreateWebhook
router.post("/heyreach/setup-all-webhooks", async (req: Request, res: Response) => {
  const { workspaceId, webhookUrl } = req.body;
  if (!workspaceId || !webhookUrl) {
    return res.status(400).json({ error: "Missing workspaceId or webhookUrl" });
  }

  const conn = await prisma.integrationConnection.findFirst({
    where: { workspaceId, provider: "heyreach", status: "connected" },
  });
  if (!conn?.authData) return res.status(403).json({ error: "HeyReach not connected." });

  const auth = parseAuthData(conn.authData);
  if (!auth?.apiKey) return res.status(403).json({ error: "Missing HeyReach API key." });

  const apiKey  = auth.apiKey.trim();
  const headers = { "X-API-KEY": apiKey, "Content-Type": "application/json", "Accept": "text/plain" };

  // All 12 event types — exact values from HeyReach API docs
  // webhookName max length = 25 chars (HeyReach validation)
  const HEYREACH_EVENTS: { eventType: string; name: string }[] = [
    { eventType: "CONNECTION_REQUEST_SENT",      name: "iq:conn_req_sent" },
    { eventType: "CONNECTION_REQUEST_ACCEPTED",  name: "iq:conn_accepted" },
    { eventType: "MESSAGE_SENT",                 name: "iq:message_sent" },
    { eventType: "MESSAGE_REPLY_RECEIVED",       name: "iq:msg_reply_rcvd" },
    { eventType: "INMAIL_SENT",                  name: "iq:inmail_sent" },
    { eventType: "INMAIL_REPLY_RECEIVED",        name: "iq:inmail_reply_rcvd" },
    { eventType: "EVERY_MESSAGE_REPLY_RECEIVED", name: "iq:every_reply_rcvd" },
    { eventType: "FOLLOW_SENT",                  name: "iq:follow_sent" },
    { eventType: "LIKED_POST",                   name: "iq:liked_post" },
    { eventType: "VIEWED_PROFILE",               name: "iq:viewed_profile" },
    { eventType: "CAMPAIGN_COMPLETED",           name: "iq:campaign_completed" },
    { eventType: "LEAD_TAG_UPDATED",             name: "iq:lead_tag_updated" },
  ];

  const results: { eventType: string; ok: boolean; error?: string }[] = [];
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  for (const { eventType, name } of HEYREACH_EVENTS) {
    await sleep(250); // HeyReach rate limit: 10 req / 2s
    try {
      await axios.post(
        "https://api.heyreach.io/api/public/webhooks/CreateWebhook",
        {
          webhookName: name,
          webhookUrl,
          eventType,
          campaignIds: [], // empty = all campaigns
        },
        { headers }
      );
      results.push({ eventType, ok: true });
    } catch (e: any) {
      const raw = e.response?.data;
      const errMsg = typeof raw === "string" ? raw
        : raw?.message ?? raw?.error ?? (raw ? JSON.stringify(raw) : e.message);
      results.push({ eventType, ok: false, error: String(errMsg).slice(0, 200) });
    }
  }

  const registered = results.filter(r => r.ok).length;
  const failed     = results.filter(r => !r.ok).length;
  return res.json({ results, registered, failed, total: results.length });
});

// ─── Production cron trigger — POST /api/integrations/poll ──────────────────
// Call this every 5 min from an external scheduler (cron-job.org, Vercel Cron, etc.)
router.post("/poll", async (_req: Request, res: Response) => {
  try {
    await syncAllWorkspaces();
    return res.json({ ok: true, ts: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Silence Check ───────────────────────────────────────────────────────────

router.post("/silence-check", async (req: Request, res: Response) => {
  const { workspaceId } = req.body;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  try {
    // 1. All connected integrations for this workspace
    const connections = await prisma.integrationConnection.findMany({
      where: { workspaceId, status: "connected" },
      select: { provider: true },
    });

    if (connections.length === 0) return res.json({ silentTools: [] });

    // 2. Build a map: normalized source → most recent lead updatedAt
    const allLeads = await prisma.lead.findMany({
      where: { workspaceId, source: { not: null } },
      select: { source: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });

    const sourceLatest: Record<string, Date> = {};
    for (const lead of allLeads) {
      const norm = normSource(lead.source);
      if (norm !== "unknown" && !sourceLatest[norm]) {
        sourceLatest[norm] = lead.updatedAt;
      }
    }

    const now = Date.now();
    const silentTools: Array<{
      toolId: string;
      hoursSinceLast: number | null;
      lastSeenAt: string | null;
      suggestions: string[];
      notificationCreated: boolean;
    }> = [];

    for (const { provider } of connections) {
      const threshold = TOOL_SILENCE_THRESHOLD[provider];
      if (!threshold) continue; // skip unknown providers

      const lastSeen = sourceLatest[provider] ?? null;
      const hoursSinceLast = lastSeen
        ? Math.floor((now - lastSeen.getTime()) / (1000 * 60 * 60))
        : null;

      // Silent if: never seen OR hours since last > threshold
      const isSilent = hoursSinceLast === null || hoursSinceLast >= threshold;
      if (!isSilent) continue;

      // Check dedup: already notified in last 24h?
      const recentNotif = await prisma.notification.findFirst({
        where: {
          workspaceId,
          type: `tool_silence_${provider}`,
          createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });

      let notificationCreated = false;
      if (!recentNotif) {
        const category = TOOL_CATEGORY_FOR_SILENCE[provider] ?? "prospecting";
        const suggestions = TOOL_SUGGESTIONS[category] ?? TOOL_SUGGESTIONS.enrichment;
        const hoursLabel = hoursSinceLast === null
          ? "No events have ever been recorded"
          : `No events for ${hoursSinceLast}h`;
        const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);

        await createNotification({
          workspaceId,
          type: `tool_silence_${provider}`,
          title: `${providerLabel} has gone silent`,
          body: `${hoursLabel} from ${providerLabel}. Possible cause: ${suggestions[0].toLowerCase()}`,
          severity: hoursSinceLast !== null && hoursSinceLast >= threshold * 2 ? "error" : "warning",
        });
        notificationCreated = true;
      }

      const category = TOOL_CATEGORY_FOR_SILENCE[provider] ?? "prospecting";
      silentTools.push({
        toolId: provider,
        hoursSinceLast,
        lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
        suggestions: TOOL_SUGGESTIONS[category] ?? TOOL_SUGGESTIONS.enrichment,
        notificationCreated,
      });
    }

    return res.json({ silentTools });
  } catch (err) {
    console.error("silence-check error:", err);
    return res.status(500).json({ error: "Silence check failed" });
  }
});

export default router;