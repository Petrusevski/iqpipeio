import { useEffect, useState, useMemo } from "react";
import PageHeader from "../components/PageHeader";
import VaultModal from "../components/VaultModal";
import { API_BASE_URL } from "../../config";
import { Search, Filter, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Zap, Copy, Check, Loader2, XCircle, RefreshCw, Bell, X } from "lucide-react";
import { useIntegrations } from "../context/IntegrationsContext";

type IntegrationStatus = "connected" | "not_connected";

// Outreach event tools: real-time events come via webhooks, not polling.
// canSync on these tools triggers a one-time historical backfill only.
const WEBHOOK_EVENT_TOOLS = new Set([
  // LinkedIn
  "heyreach", "expandi", "dripify", "waalaxy", "meetalfred",
  // Cold email
  "lemlist", "instantly", "smartlead", "mailshake",
  // Phone
  "aircall", "dialpad", "kixie", "orum",
  // SMS / WhatsApp
  "twilio", "sakari", "wati",
  // Multichannel
  "outreach", "salesloft", "replyio", "klenty",
  // Prospecting
  "apollo", "phantombuster",
  // Enrichment
  "clearbit", "zoominfo", "pdl", "hunter", "lusha", "cognism", "snovio", "rocketreach",
  // CRM
  "hubspot", "pipedrive", "salesforce",
  // Revenue
  "chargebee",
  // Automation
  "n8n", "make",
]);

type IntegrationApp = {
  id: string;
  name: string;
  description: string;
  domain: string;
  status: IntegrationStatus;
  canSync?: boolean;
  canWebhook?: boolean;
};

type GTMSection = {
  id: string;
  title: string;
  subtitle: string;
  apps: IntegrationApp[];
};

// --- Tool Logo component ---
function ToolLogo({ domain, name }: { domain: string; name: string }) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center text-[11px] font-semibold text-slate-100 uppercase shrink-0">
        {name[0]}
      </div>
    );
  }

  return (
    <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0">
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt={name}
        width={22}
        height={22}
        className="object-contain"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

const integrationStatusMap: Record<string, IntegrationStatus> = {
  clay: "not_connected",
  hubspot: "not_connected",
  heyreach: "not_connected",
  stripe: "not_connected",
};

const getStatus = (id: string): IntegrationStatus =>
  integrationStatusMap[id] ?? "not_connected";

// --- Per-tool setup instructions shown after connecting -----------------

type SetupStep = {
  label: string;
  detail: string;
  docUrl?: string;
};

const TOOL_SETUP_INSTRUCTIONS: Record<string, { headline: string; steps: SetupStep[] }> = {
  clay: {
    headline: "Clay needs a webhook URL to push enriched rows back to iqpipe.",
    steps: [
      { label: "Copy your iqpipe webhook URL", detail: "Go to Settings → Webhooks and copy the inbound URL for Clay." },
      { label: "Open your Clay table", detail: "In Clay, open the table or view you want to sync.", docUrl: "https://clay.com/docs/getting-started/webhooks" },
      { label: "Add a Webhook action column", detail: "Add a new column → Action → Webhook. Paste your iqpipe URL as the endpoint." },
      { label: "Map required fields", detail: "Map at minimum: email, fullName, company, jobTitle, and any custom score columns." },
      { label: "Run a test row", detail: "Click Run on one row and confirm iqpipe receives the payload in the Activity feed." },
    ],
  },
  phantombuster: {
    headline: "PhantomBuster requires configuring your Phantoms and scheduling them to push data.",
    steps: [
      { label: "Get your API key", detail: "In PhantomBuster → Account → API key. Copy it and paste it via Connect.", docUrl: "https://hub.phantombuster.com/docs/api" },
      { label: "Configure output webhook", detail: "In each Phantom → Advanced Settings → Webhook. Add your iqpipe PhantomBuster inbound webhook URL." },
      { label: "Map output fields", detail: "Ensure your Phantom output includes: profileUrl, firstName, lastName, jobTitle, companyName, email (if available)." },
      { label: "Schedule your Phantoms", detail: "Set a launch schedule (e.g. every 6 hours) so data flows automatically into iqpipe." },
    ],
  },
  apollo: {
    headline: "Apollo sync requires configuring your sending domain and API credentials.",
    steps: [
      { label: "Copy your Apollo API key", detail: "In Apollo.io → Settings → Integrations → API. Copy your API key and paste it via Connect.", docUrl: "https://apolloio.github.io/apollo-api-docs/" },
      { label: "Verify your sending domain", detail: "In Apollo → Settings → Email → Sending Domains, verify the domain you plan to use for outbound." },
      { label: "Set up webhook", detail: "In Apollo → Settings → Integrations → Webhooks, add your iqpipe Apollo webhook URL with events: contact.emailed, contact.replied, sequence.finished." },
    ],
  },
  smartlead: {
    headline: "Smartlead needs a webhook to push campaign events to iqpipe.",
    steps: [
      { label: "Copy your API key", detail: "In Smartlead → Settings → API → API Key. Copy and paste via Connect.", docUrl: "https://help.smartlead.ai/api-integration" },
      { label: "Add a global webhook", detail: "In Smartlead → Settings → Webhooks, add your iqpipe Smartlead webhook URL. Subscribe to: email_open, email_click, email_reply, lead_unsubscribed." },
      { label: "Set reply tracking domain", detail: "In Settings → Reply Tracking, set your custom tracking domain for accurate open/click attribution." },
    ],
  },
  stripe: {
    headline: "Stripe requires a webhook endpoint to attribute revenue to pipeline activities.",
    steps: [
      { label: "Create a webhook endpoint", detail: "In Stripe Dashboard → Developers → Webhooks → Add endpoint. Paste your iqpipe Stripe webhook URL.", docUrl: "https://stripe.com/docs/webhooks" },
      { label: "Select events to listen for", detail: "Subscribe to: payment_intent.succeeded, customer.subscription.created, customer.subscription.updated, invoice.paid." },
      { label: "Copy Webhook Secret", detail: "After creating the endpoint, copy the Webhook Signing Secret (whsec_…) and re-enter via Connect as your Access Token." },
      { label: "Test with Stripe CLI", detail: "Run: stripe trigger payment_intent.succeeded and confirm the event appears in iqpipe Revenue feed." },
    ],
  },
};

// --- Per-tool webhook configuration guidance ----------------------------
// Tells the user exactly where in each tool's UI to paste the webhook URL.

type WebhookInstruction = {
  where: string;       // Navigation path inside the tool
  events: string;      // Which events to subscribe to
  note?: string;       // Optional extra note (e.g. Stripe signing secret)
  docUrl?: string;
};

const WEBHOOK_INSTRUCTIONS: Record<string, WebhookInstruction> = {
  // ── LinkedIn outreach ──────────────────────────────────────────────────────
  heyreach: {
    where: "Auto-registered via iqpipe — or manually in HeyReach → Settings → Integrations → Webhooks",
    events: "All 12 event types across all campaigns",
    note: "Click 'Auto-register all events' below to create all 12 webhooks in HeyReach with one click.",
    docUrl: "https://help.heyreach.io",
  },
  expandi: {
    where: "Expandi → Settings → Webhooks → Add Webhook",
    events: "connection_request_sent, connection_accepted, message_sent, reply_received, profile_visited",
    docUrl: "https://expandi.io/docs",
  },
  dripify: {
    where: "Dripify → Settings → Webhooks → Create Webhook",
    events: "connection_request_sent, connection_accepted, message_sent, reply_received",
    docUrl: "https://help.dripify.io",
  },
  waalaxy: {
    where: "Waalaxy → Settings → Webhooks → New Webhook",
    events: "action.connection_request, action.message, action.visit, reply.received",
    docUrl: "https://help.waalaxy.com",
  },
  meetalfred: {
    where: "Meet Alfred → Settings → API & Webhooks → Create Webhook",
    events: "connection_request_sent, connection_accepted, message_sent, reply_received",
    docUrl: "https://meetalfred.com/help",
  },
  // ── Cold email ─────────────────────────────────────────────────────────────
  lemlist: {
    where: "Lemlist → Settings → Webhooks → + Add endpoint",
    events: "emailReplied, interested, meetingBooked",
    docUrl: "https://help.lemlist.com",
  },
  instantly: {
    where: "Instantly → Settings → Integrations → Webhooks → New webhook",
    events: "reply_received, email_sent, campaign_completed",
    docUrl: "https://help.instantly.ai",
  },
  smartlead: {
    where: "Smartlead → Settings → Webhooks → Add global webhook",
    events: "LEAD_REPLIED, EMAIL_SENT, CAMPAIGN_COMPLETED",
    docUrl: "https://help.smartlead.ai",
  },
  mailshake: {
    where: "Mailshake → Extensions → Notifications → Webhooks → Add Webhook",
    events: "Sent, Opened, Replied, Clicked, LeadCaught",
    docUrl: "https://mailshake.com/api",
  },
  // ── Phone / calling ────────────────────────────────────────────────────────
  aircall: {
    where: "Aircall → Integrations → Webhooks → New Webhook",
    events: "call.created, call.answered, call.ended, call.voicemail_left, contact.created",
    docUrl: "https://developer.aircall.io/api-references/#webhooks",
  },
  dialpad: {
    where: "Dialpad → Admin Portal → Webhooks → Add Webhook",
    events: "call_ended, call_connected, voicemail, sms_sent, sms_received",
    docUrl: "https://developers.dialpad.com/docs/webhooks",
  },
  kixie: {
    where: "Kixie → Settings → Integrations → Webhooks → Add Webhook",
    events: "Outbound Call, Inbound Call, Voicemail, SMS Sent, SMS Received",
    docUrl: "https://kixie.com/resources/developers",
  },
  orum: {
    where: "Orum → Settings → Webhooks → New Webhook",
    events: "call_completed, call_connected, voicemail_left, meeting_booked",
    docUrl: "https://orum.io/help",
  },
  // ── SMS / WhatsApp ─────────────────────────────────────────────────────────
  twilio: {
    where: "Twilio → Phone Numbers → Messaging → Webhook URL (SMS) or Messaging → Services → Webhooks (WhatsApp)",
    events: "Inbound messages, message status callbacks (delivered, read)",
    note: "Use your Account SID as API Key and Auth Token as Access Token when connecting.",
    docUrl: "https://www.twilio.com/docs/usage/webhooks",
  },
  sakari: {
    where: "Sakari → Account → API & Webhooks → Add Webhook URL",
    events: "message.received, message.sent, message.delivered, optout",
    docUrl: "https://developer.sakari.io",
  },
  wati: {
    where: "WATI → Settings → Configure Webhook → Set Webhook URL",
    events: "message (inbound), template_sent, session_message, read",
    note: "WATI sends all WhatsApp events to a single webhook URL — no per-event selection needed.",
    docUrl: "https://docs.wati.io/docs/webhooks",
  },
  // ── Multichannel ──────────────────────────────────────────────────────────
  outreach: {
    where: "Outreach → Settings → Webhooks → Create Webhook",
    events: "prospect.created, sequence_state.created, call.created, email.opened, email.replied",
    note: "Outreach uses OAuth — paste your OAuth Access Token via Connect.",
    docUrl: "https://developers.outreach.io/api/webhooks",
  },
  salesloft: {
    where: "Salesloft → Settings → Webhooks → Add Webhook",
    events: "email_opened, email_replied, call_completed, step_completed, person_stage_changed",
    note: "Salesloft uses OAuth — paste your OAuth Access Token via Connect.",
    docUrl: "https://developers.salesloft.com/docs/api/webhooks",
  },
  replyio: {
    where: "Reply.io → Settings → Integrations → Webhooks → Add Webhook",
    events: "emailReplied, emailOpened, callCompleted, linkedinReplied, stepCompleted",
    docUrl: "https://reply.io/docs/webhooks",
  },
  klenty: {
    where: "Klenty → Settings → Integrations → Webhooks → Create Webhook",
    events: "Email Replied, Email Opened, Email Clicked, Call Completed, Task Completed",
    docUrl: "https://www.klenty.com/help",
  },
  // ── Prospecting ────────────────────────────────────────────────────────────
  apollo: {
    where: "Apollo → Settings → Integrations → Webhooks → + Add Webhook",
    events: "contact.emailed, contact.replied, sequence.finished, contact.bounced, contact.unsubscribed",
    docUrl: "https://apolloio.github.io/apollo-api-docs/",
  },
  phantombuster: {
    where: "Each Phantom → Advanced Settings → Webhook URL (run completion notifications)",
    events: "Phantom output (run finished), Phantom error",
    note: "PhantomBuster sends a POST to your webhook URL each time a Phantom run finishes — configure per-Phantom.",
    docUrl: "https://hub.phantombuster.com/docs/api",
  },
  // ── Enrichment ─────────────────────────────────────────────────────────────
  clearbit: {
    where: "Clearbit → Dashboard → Webhooks → Add Endpoint (for Reveal) or enrichment API callback_url param",
    events: "person_found, company_found, enrichment_failed, reveal.identified, bulk_completed",
    note: "For async person enrichment, pass webhook_url in your API request. For Reveal, configure in the Clearbit dashboard.",
    docUrl: "https://dashboard.clearbit.com/docs#webhooks",
  },
  zoominfo: {
    where: "ZoomInfo → Admin → Integrations → Webhooks → Create Webhook",
    events: "contact.exported, company.exported, intent.spike, contact.updated",
    docUrl: "https://api-docs.zoominfo.com",
  },
  pdl: {
    where: "People Data Labs → Pass webhook_url parameter in your Bulk Enrichment API calls",
    events: "enrichment_completed, bulk_completed (job finished), enrichment_failed",
    note: "PDL uses a callback URL per-request rather than a global webhook — pass your iqpipe PDL webhook URL as webhook_url in each bulk API call.",
    docUrl: "https://docs.peopledatalabs.com/docs/webhooks",
  },
  hunter: {
    where: "Hunter → Campaigns → (select campaign) → Settings → Webhook URL",
    events: "campaign.email_sent, campaign.email_opened, campaign.email_replied, email_verifier.verified",
    docUrl: "https://hunter.io/api-documentation/v2",
  },
  lusha: {
    where: "Lusha → Settings → Webhooks → Add Webhook",
    events: "contact.enriched, export.completed, intent.detected",
    docUrl: "https://www.lusha.com/docs",
  },
  cognism: {
    where: "Cognism → Settings → Integrations → Webhooks → Add Webhook URL",
    events: "contact.exported, company.exported, intent.signal (Bombora), list.refreshed",
    docUrl: "https://developer.cognism.com",
  },
  snovio: {
    where: "Snov.io → Settings → Webhooks → Add Webhook",
    events: "campaign.replied, campaign.opened, campaign.email_sent, prospect.found, email.verified, bounced",
    docUrl: "https://snov.io/api",
  },
  rocketreach: {
    where: "RocketReach → Account Settings → Webhooks → Add Webhook",
    events: "lookup.completed, bulk.completed, export.completed",
    docUrl: "https://rocketreach.co/api",
  },
  // ── CRM ────────────────────────────────────────────────────────────────────
  hubspot: {
    where: "HubSpot → Settings → Integrations → Private Apps → (your app) → Webhooks → Add subscription",
    events: "contact.creation, contact.propertyChange, deal.creation, deal.propertyChange, company.creation",
    note: "Create a HubSpot Private App with CRM Object scopes, then add webhook subscriptions for the object types you want to track.",
    docUrl: "https://developers.hubspot.com/docs/api/webhooks",
  },
  pipedrive: {
    where: "Pipedrive → Settings → Tools and integrations → Webhooks → + Add webhook",
    events: "added.deal, updated.deal, added.person, updated.person, added.activity, added.note",
    docUrl: "https://developers.pipedrive.com/docs/api/v1/Webhooks",
  },
  salesforce: {
    where: "Salesforce → Setup → Outbound Messages (for SOAP) OR use a Flow with a custom REST callout to your webhook URL",
    events: "lead.created, lead.converted, opportunity.created, opportunity.updated, opportunity.won, contact.created, task.completed",
    note: "Salesforce does not have native JSON webhooks — use Process Builder / Flow with an HTTP callout, or a middleware like Zapier/n8n to forward events to your iqpipe Salesforce webhook URL.",
    docUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/",
  },
  // ── Revenue ────────────────────────────────────────────────────────────────
  stripe: {
    where: "Stripe → Dashboard → Developers → Webhooks → Add endpoint",
    events: "payment_intent.succeeded, customer.subscription.created, customer.subscription.updated, invoice.paid, checkout.session.completed",
    note: "After creating the endpoint copy the Signing Secret (whsec_…) and re-enter it via Connect as your Webhook Secret.",
    docUrl: "https://stripe.com/docs/webhooks",
  },
  chargebee: {
    where: "Chargebee → Settings → Configure Chargebee → Webhooks → Add Webhook URL",
    events: "subscription_created, subscription_changed, subscription_cancelled, payment_succeeded, payment_failed, invoice_generated",
    docUrl: "https://www.chargebee.com/docs/2.0/webhook_settings.html",
  },
  // ── Automation Platforms ───────────────────────────────────────────────────
  n8n: {
    where: "In any n8n workflow: add an HTTP Request node → Method: POST → URL: your iqpipe n8n webhook URL → Body: JSON with lead fields",
    events: "Any event you map — required fields: email (or linkedin_url / phone). Optional: event_type, source_tool, first_name, last_name, company, title",
    note: "Add \"source_tool\": \"heyreach\" (or any connected tool ID) to credit the event to that tool instead of n8n. If that tool's direct webhook already recorded the same event for the same lead today, the relay is automatically dropped — no duplicates.",
    docUrl: "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.httprequest/",
  },
  make: {
    where: "In any Make scenario: add an HTTP module → Method: POST → URL: your iqpipe Make webhook URL → Body type: Raw → Content-Type: application/json",
    events: "Any event you map — required fields: email (or linkedin_url / phone). Optional: event_type, source_tool, first_name, last_name, company, title",
    note: "Add \"source_tool\": \"smartlead\" (or any connected tool ID) to credit the event to that tool instead of make. If that tool's direct webhook already recorded the same event for the same lead today, the relay is automatically dropped — no duplicates.",
    docUrl: "https://www.make.com/en/help/tools/http",
  },
};

// --- Per-app webhook events for user selection --------------------------

type WebhookEvent = {
  id: string;
  label: string;
  description: string;
  defaultEnabled?: boolean;
};

const APP_WEBHOOK_EVENTS: Record<string, WebhookEvent[]> = {
  // ── Prospecting ──────────────────────────────────────────────────────────
  clay: [
    { id: "row.enriched", label: "Row Enriched", description: "Enriched row pushed from Clay table to iqpipe", defaultEnabled: true },
    { id: "row.failed", label: "Row Failed", description: "Enrichment failed for a row in Clay" },
    { id: "table.run_completed", label: "Table Run Completed", description: "Clay table run finished processing all rows", defaultEnabled: true },
    { id: "webhook.outbound", label: "Outbound Webhook Fired", description: "Clay fired an outbound webhook action column" },
  ],
  apollo: [
    { id: "contact.emailed", label: "Contact Emailed", description: "Email sent to a contact via Apollo sequence", defaultEnabled: true },
    { id: "contact.replied", label: "Contact Replied", description: "Contact replied to an Apollo sequence email", defaultEnabled: true },
    { id: "contact.bounced", label: "Email Bounced", description: "Email delivery failed for a contact" },
    { id: "sequence.finished", label: "Sequence Finished", description: "Contact completed all steps in a sequence", defaultEnabled: true },
    { id: "contact.unsubscribed", label: "Unsubscribed", description: "Contact unsubscribed from sequences" },
    { id: "contact.exported", label: "Contact Exported", description: "Contact added to a list or exported" },
  ],
  phantombuster: [
    { id: "phantom.output", label: "Phantom Output", description: "Phantom completed a run and output data", defaultEnabled: true },
    { id: "phantom.error", label: "Phantom Error", description: "Phantom run failed or encountered an error" },
    { id: "lead.scraped", label: "Lead Scraped", description: "New lead scraped from LinkedIn or web", defaultEnabled: true },
    { id: "schedule.run", label: "Scheduled Run", description: "Phantom triggered by its schedule" },
  ],
  // ── Enrichment ────────────────────────────────────────────────────────────
  clearbit: [
    { id: "person.found", label: "Person Enriched", description: "Person data matched and returned from Clearbit", defaultEnabled: true },
    { id: "company.found", label: "Company Enriched", description: "Company profile data matched", defaultEnabled: true },
    { id: "enrichment.failed", label: "Enrichment Failed", description: "Clearbit could not find a match for this record" },
    { id: "reveal.identified", label: "Visitor Identified", description: "Anonymous website visitor de-anonymized via Clearbit Reveal" },
    { id: "bulk.completed", label: "Bulk Job Completed", description: "Batch enrichment job finished processing", defaultEnabled: true },
  ],
  zoominfo: [
    { id: "contact.exported", label: "Contact Exported", description: "Contact exported from ZoomInfo to your list or CRM", defaultEnabled: true },
    { id: "company.exported", label: "Company Exported", description: "Company record exported from ZoomInfo", defaultEnabled: true },
    { id: "intent.spike", label: "Intent Signal Spike", description: "Buying intent spike detected for a tracked company", defaultEnabled: true },
    { id: "contact.updated", label: "Contact Updated", description: "ZoomInfo contact data refreshed with new info" },
    { id: "scoops.new", label: "New Scoop", description: "Business event (hire, funding, expansion) detected" },
  ],
  pdl: [
    { id: "enrich.person.success", label: "Person Enriched", description: "Person record successfully enriched via PDL API", defaultEnabled: true },
    { id: "enrich.company.success", label: "Company Enriched", description: "Company record enriched", defaultEnabled: true },
    { id: "enrich.failed", label: "Enrichment Failed", description: "PDL could not find a matching record" },
    { id: "bulk.completed", label: "Bulk Job Completed", description: "Batch enrichment job finished", defaultEnabled: true },
    { id: "search.completed", label: "Search Completed", description: "Elasticsearch-style search returned results" },
  ],
  hunter: [
    { id: "domain_search.completed", label: "Domain Search Completed", description: "Email addresses found for a domain lookup", defaultEnabled: true },
    { id: "email_finder.found", label: "Email Found", description: "Email address successfully found for a person", defaultEnabled: true },
    { id: "email_verifier.verified", label: "Email Verified", description: "Email verification result returned" },
    { id: "campaign.email_sent", label: "Campaign Email Sent", description: "Email sent in a Hunter campaign" },
    { id: "campaign.email_opened", label: "Campaign Email Opened", description: "Prospect opened a Hunter campaign email" },
    { id: "campaign.email_replied", label: "Campaign Email Replied", description: "Reply received in a Hunter campaign", defaultEnabled: true },
  ],
  lusha: [
    { id: "contact.enriched", label: "Contact Enriched", description: "Phone and email data returned for a contact", defaultEnabled: true },
    { id: "company.enriched", label: "Company Enriched", description: "Company profile data returned from Lusha", defaultEnabled: true },
    { id: "export.completed", label: "Bulk Export Completed", description: "Bulk contact export finished processing", defaultEnabled: true },
    { id: "intent.detected", label: "Intent Detected", description: "Buying intent signal detected for a tracked account" },
  ],
  cognism: [
    { id: "contact.exported", label: "Contact Exported", description: "Contact exported from Cognism Diamond Data", defaultEnabled: true },
    { id: "company.exported", label: "Company Exported", description: "Company data exported", defaultEnabled: true },
    { id: "intent.signal", label: "Intent Signal (Bombora)", description: "Bombora intent signal received for a tracked account", defaultEnabled: true },
    { id: "list.refreshed", label: "List Refreshed", description: "Saved list updated with new matching records" },
    { id: "contact.verified", label: "Phone Verified", description: "Phone number diamond-verified by Cognism" },
  ],
  snovio: [
    { id: "prospect.found", label: "Prospect Found", description: "Email and contact data found for a searched domain or name", defaultEnabled: true },
    { id: "email.verified", label: "Email Verified", description: "Email verification result returned" },
    { id: "campaign.email_sent", label: "Campaign Email Sent", description: "Email sent in a Snov.io drip campaign" },
    { id: "campaign.opened", label: "Email Opened", description: "Prospect opened a Snov.io campaign email" },
    { id: "campaign.replied", label: "Reply Received", description: "Reply received in a Snov.io campaign", defaultEnabled: true },
    { id: "campaign.bounced", label: "Email Bounced", description: "Email delivery failed in campaign" },
  ],
  rocketreach: [
    { id: "lookup.completed", label: "Lookup Completed", description: "Contact lookup returned phone, email, and social data", defaultEnabled: true },
    { id: "bulk.completed", label: "Bulk Lookup Completed", description: "Batch lookup job finished processing", defaultEnabled: true },
    { id: "export.completed", label: "Export Completed", description: "Contact list export completed" },
    { id: "list.created", label: "List Created", description: "New contact list created in RocketReach" },
  ],
  // ── LinkedIn outreach ──────────────────────────────────────────────────────
  heyreach: [
    { id: "CONNECTION_REQUEST_PENDING", label: "Connection Request Sent", description: "LinkedIn connection request was sent to prospect", defaultEnabled: true },
    { id: "CONNECTED", label: "Connection Accepted", description: "Prospect accepted the LinkedIn connection request", defaultEnabled: true },
    { id: "MESSAGE_SENT", label: "Message Sent", description: "LinkedIn direct message sent to prospect", defaultEnabled: true },
    { id: "REPLY_RECEIVED", label: "Reply Received", description: "Prospect replied to a LinkedIn message", defaultEnabled: true },
    { id: "INMAIL_SENT", label: "InMail Sent", description: "LinkedIn InMail sent to out-of-network prospect" },
    { id: "PROFILE_VISITED", label: "Profile Visited", description: "LinkedIn profile visit performed as campaign step" },
    { id: "FOLLOW", label: "Company Followed", description: "Company page followed on LinkedIn" },
    { id: "LIKE_POST", label: "Post Liked", description: "Prospect's LinkedIn post liked" },
    { id: "COMMENT_POST", label: "Post Commented", description: "Comment left on a LinkedIn post" },
    { id: "LEAD_FINISHED", label: "Lead Finished", description: "Lead completed all steps in a HeyReach campaign", defaultEnabled: true },
    { id: "CAMPAIGN_COMPLETED", label: "Campaign Completed", description: "All leads in a campaign have been processed" },
  ],
  expandi: [
    { id: "connection_request_sent", label: "Connection Request Sent", description: "LinkedIn connection request sent", defaultEnabled: true },
    { id: "connection_accepted", label: "Connection Accepted", description: "Connection request was accepted", defaultEnabled: true },
    { id: "message_sent", label: "Message Sent", description: "LinkedIn message sent to prospect", defaultEnabled: true },
    { id: "reply_received", label: "Reply Received", description: "Prospect replied to a message", defaultEnabled: true },
    { id: "profile_visited", label: "Profile Visited", description: "Prospect's LinkedIn profile was visited" },
    { id: "sequence_completed", label: "Sequence Completed", description: "Prospect finished all sequence steps" },
  ],
  dripify: [
    { id: "connection_request_sent", label: "Connection Request Sent", description: "LinkedIn connection request sent via Dripify", defaultEnabled: true },
    { id: "connection_accepted", label: "Connection Accepted", description: "Prospect accepted connection request", defaultEnabled: true },
    { id: "message_sent", label: "Message Sent", description: "Direct message sent", defaultEnabled: true },
    { id: "reply_received", label: "Reply Received", description: "Prospect replied to a message", defaultEnabled: true },
    { id: "campaign_completed", label: "Campaign Completed", description: "Prospect finished drip campaign" },
  ],
  waalaxy: [
    { id: "action.connection_request", label: "Connection Request Sent", description: "LinkedIn connection request sent via Waalaxy", defaultEnabled: true },
    { id: "action.message", label: "Message Sent", description: "LinkedIn message sent", defaultEnabled: true },
    { id: "action.visit", label: "Profile Visited", description: "LinkedIn profile visited" },
    { id: "reply.received", label: "Reply Received", description: "Prospect replied to a message", defaultEnabled: true },
    { id: "email.sent", label: "Email Sent", description: "Email sent via Waalaxy sequence" },
    { id: "email.replied", label: "Email Replied", description: "Reply received to Waalaxy email" },
  ],
  meetalfred: [
    { id: "connection_request_sent", label: "Connection Request Sent", description: "LinkedIn connection request sent", defaultEnabled: true },
    { id: "connection_accepted", label: "Connection Accepted", description: "Connection accepted", defaultEnabled: true },
    { id: "message_sent", label: "Message Sent", description: "LinkedIn message sent", defaultEnabled: true },
    { id: "reply_received", label: "Reply Received", description: "Reply received from prospect", defaultEnabled: true },
    { id: "twitter_followed", label: "Twitter Followed", description: "Prospect followed on Twitter via Alfred" },
  ],
  // ── Cold email ─────────────────────────────────────────────────────────────
  smartlead: [
    { id: "LEAD_REPLIED", label: "Reply Received", description: "Lead replied to a campaign email", defaultEnabled: true },
    { id: "EMAIL_SENT", label: "Email Sent", description: "Email delivered to lead", defaultEnabled: true },
    { id: "EMAIL_OPENED", label: "Email Opened", description: "Lead opened an email" },
    { id: "EMAIL_CLICKED", label: "Link Clicked", description: "Lead clicked a tracked link in email" },
    { id: "LEAD_UNSUBSCRIBED", label: "Unsubscribed", description: "Lead unsubscribed from campaigns" },
    { id: "BOUNCED", label: "Email Bounced", description: "Email delivery permanently failed" },
    { id: "MARKED_SPAM", label: "Marked as Spam", description: "Lead marked email as spam" },
    { id: "CAMPAIGN_COMPLETED", label: "Campaign Completed", description: "All steps sent to all leads", defaultEnabled: true },
  ],
  instantly: [
    { id: "reply_received", label: "Reply Received", description: "Lead replied to a campaign email", defaultEnabled: true },
    { id: "email_sent", label: "Email Sent", description: "Email sent to a lead", defaultEnabled: true },
    { id: "email_opened", label: "Email Opened", description: "Lead opened an email" },
    { id: "link_clicked", label: "Link Clicked", description: "Lead clicked a tracked link" },
    { id: "lead_unsubscribed", label: "Unsubscribed", description: "Lead opted out of emails" },
    { id: "email_bounced", label: "Email Bounced", description: "Email delivery failed" },
    { id: "out_of_office", label: "Out of Office", description: "Auto-reply detected from lead" },
    { id: "campaign_completed", label: "Campaign Completed", description: "Campaign finished sending to all leads" },
  ],
  lemlist: [
    { id: "emailSent", label: "Email Sent", description: "Email sent to lead in campaign", defaultEnabled: true },
    { id: "emailOpened", label: "Email Opened", description: "Lead opened an email" },
    { id: "emailClicked", label: "Link Clicked", description: "Lead clicked a tracked link" },
    { id: "emailReplied", label: "Reply Received", description: "Lead replied to a campaign email", defaultEnabled: true },
    { id: "interested", label: "Marked Interested", description: "Lead flagged as interested", defaultEnabled: true },
    { id: "notInterested", label: "Marked Not Interested", description: "Lead flagged as not interested" },
    { id: "meetingBooked", label: "Meeting Booked", description: "Lead booked a meeting via Lemlist", defaultEnabled: true },
    { id: "unsubscribed", label: "Unsubscribed", description: "Lead unsubscribed from sequences" },
    { id: "bounced", label: "Email Bounced", description: "Email delivery failed" },
    { id: "linkedinInviteSent", label: "LinkedIn Invite Sent", description: "LinkedIn connection request sent via Lemlist" },
    { id: "linkedinReplied", label: "LinkedIn Reply", description: "Reply received on LinkedIn step" },
  ],
  mailshake: [
    { id: "Sent", label: "Email Sent", description: "Email sent to prospect", defaultEnabled: true },
    { id: "Opened", label: "Email Opened", description: "Prospect opened an email" },
    { id: "Clicked", label: "Link Clicked", description: "Prospect clicked a link" },
    { id: "Replied", label: "Reply Received", description: "Prospect replied to email", defaultEnabled: true },
    { id: "LeadCaught", label: "Lead Caught", description: "Prospect matched a lead-catch condition", defaultEnabled: true },
    { id: "Unsubscribed", label: "Unsubscribed", description: "Prospect unsubscribed" },
    { id: "Bounced", label: "Email Bounced", description: "Email delivery failed" },
  ],
  // ── Phone ─────────────────────────────────────────────────────────────────
  aircall: [
    { id: "call.created", label: "Call Initiated", description: "Outbound or inbound call started", defaultEnabled: true },
    { id: "call.answered", label: "Call Answered", description: "Call picked up by contact", defaultEnabled: true },
    { id: "call.ended", label: "Call Ended", description: "Call completed — includes duration and outcome", defaultEnabled: true },
    { id: "call.voicemail_left", label: "Voicemail Left", description: "Voicemail recorded for an unanswered call" },
    { id: "call.missed", label: "Call Missed", description: "Inbound call not answered" },
    { id: "call.transferred", label: "Call Transferred", description: "Call transferred to another agent or team" },
    { id: "contact.created", label: "Contact Created", description: "New contact created in Aircall" },
    { id: "contact.updated", label: "Contact Updated", description: "Contact details modified in Aircall" },
  ],
  dialpad: [
    { id: "call_ended", label: "Call Ended", description: "Call completed with duration and disposition", defaultEnabled: true },
    { id: "call_connected", label: "Call Connected", description: "Call answered by contact", defaultEnabled: true },
    { id: "call_missed", label: "Call Missed", description: "Outbound call not answered" },
    { id: "voicemail", label: "Voicemail Left", description: "Voicemail recorded or received" },
    { id: "sms_sent", label: "SMS Sent", description: "SMS message sent via Dialpad" },
    { id: "sms_received", label: "SMS Received", description: "SMS reply received" },
    { id: "recording_ready", label: "Recording Ready", description: "Call recording and transcript available" },
  ],
  kixie: [
    { id: "OutboundCall", label: "Outbound Call", description: "Outbound call placed via Kixie", defaultEnabled: true },
    { id: "InboundCall", label: "Inbound Call", description: "Inbound call received" },
    { id: "CallEnded", label: "Call Ended", description: "Call completed with outcome logged", defaultEnabled: true },
    { id: "Voicemail", label: "Voicemail Dropped", description: "Pre-recorded voicemail dropped to contact" },
    { id: "SMSSent", label: "SMS Sent", description: "SMS sent to contact" },
    { id: "SMSReceived", label: "SMS Received", description: "SMS reply received from contact", defaultEnabled: true },
    { id: "ConnectionRequest", label: "Connection Requested", description: "Contact requested connection" },
  ],
  orum: [
    { id: "call_completed", label: "Call Completed", description: "Call finished — includes talk time, outcome, notes", defaultEnabled: true },
    { id: "call_connected", label: "Call Connected", description: "Live connection established with prospect", defaultEnabled: true },
    { id: "voicemail_left", label: "Voicemail Left", description: "Voicemail dropped to prospect" },
    { id: "meeting_booked", label: "Meeting Booked", description: "Meeting scheduled directly from an Orum call", defaultEnabled: true },
    { id: "contact_dispositioned", label: "Contact Dispositioned", description: "Call outcome logged for a contact" },
  ],
  // ── SMS / WhatsApp ──────────────────────────────────────────────────────
  twilio: [
    { id: "message.sent", label: "Message Sent", description: "SMS or WhatsApp message sent", defaultEnabled: true },
    { id: "message.delivered", label: "Message Delivered", description: "Message delivery confirmed by carrier" },
    { id: "message.received", label: "Message Received", description: "Inbound SMS or WhatsApp reply received", defaultEnabled: true },
    { id: "message.failed", label: "Message Failed", description: "Message delivery failed" },
    { id: "call.initiated", label: "Call Initiated", description: "Programmatic voice call started" },
    { id: "call.completed", label: "Call Completed", description: "Programmatic voice call finished" },
    { id: "opt_out", label: "Opt-Out Received", description: "Contact replied STOP to unsubscribe" },
  ],
  sakari: [
    { id: "message.received", label: "Message Received", description: "Inbound SMS reply received from contact", defaultEnabled: true },
    { id: "message.sent", label: "Message Sent", description: "Outbound SMS sent to contact", defaultEnabled: true },
    { id: "message.delivered", label: "Message Delivered", description: "SMS delivery confirmed" },
    { id: "optout", label: "Opt-Out", description: "Contact replied STOP or opted out" },
    { id: "campaign.completed", label: "Campaign Completed", description: "SMS campaign finished sending" },
  ],
  wati: [
    { id: "message", label: "Message Received", description: "Inbound WhatsApp message from contact", defaultEnabled: true },
    { id: "template_sent", label: "Template Sent", description: "WhatsApp template message sent", defaultEnabled: true },
    { id: "session_message", label: "Session Message Sent", description: "Free-form session message sent within 24h window" },
    { id: "read", label: "Message Read", description: "Contact read the WhatsApp message" },
    { id: "delivered", label: "Message Delivered", description: "Message delivered to contact's device" },
    { id: "failed", label: "Message Failed", description: "WhatsApp message delivery failed" },
  ],
  // ── Multichannel ──────────────────────────────────────────────────────────
  outreach: [
    { id: "prospect.created", label: "Prospect Created", description: "New prospect added to Outreach CRM", defaultEnabled: true },
    { id: "sequence_state.created", label: "Enrolled in Sequence", description: "Prospect added to an outreach sequence", defaultEnabled: true },
    { id: "email.opened", label: "Email Opened", description: "Prospect opened a sequence email" },
    { id: "email.replied", label: "Email Replied", description: "Prospect replied to sequence email", defaultEnabled: true },
    { id: "call.created", label: "Call Logged", description: "Call activity logged in Outreach", defaultEnabled: true },
    { id: "task.completed", label: "Task Completed", description: "Manual task marked as done" },
    { id: "opportunity.created", label: "Opportunity Created", description: "New opportunity created", defaultEnabled: true },
    { id: "meeting.booked", label: "Meeting Booked", description: "Meeting scheduled via Outreach", defaultEnabled: true },
    { id: "stage.changed", label: "Stage Changed", description: "Prospect moved to a different stage" },
  ],
  salesloft: [
    { id: "email_opened", label: "Email Opened", description: "Prospect opened a Salesloft email" },
    { id: "email_replied", label: "Email Replied", description: "Reply received on a Salesloft email", defaultEnabled: true },
    { id: "email_bounced", label: "Email Bounced", description: "Email delivery failed" },
    { id: "call_completed", label: "Call Completed", description: "Call activity completed", defaultEnabled: true },
    { id: "step_completed", label: "Step Completed", description: "Cadence step completed", defaultEnabled: true },
    { id: "person_stage_changed", label: "Stage Changed", description: "Prospect moved to a new stage", defaultEnabled: true },
    { id: "meeting_booked", label: "Meeting Booked", description: "Meeting scheduled via Salesloft", defaultEnabled: true },
    { id: "link_clicked", label: "Link Clicked", description: "Prospect clicked a tracked link" },
  ],
  replyio: [
    { id: "emailReplied", label: "Email Replied", description: "Prospect replied to a Reply.io email", defaultEnabled: true },
    { id: "emailOpened", label: "Email Opened", description: "Prospect opened an email" },
    { id: "callCompleted", label: "Call Completed", description: "Call task completed in Reply.io", defaultEnabled: true },
    { id: "linkedinReplied", label: "LinkedIn Reply", description: "Reply received on LinkedIn step", defaultEnabled: true },
    { id: "stepCompleted", label: "Step Completed", description: "Sequence step completed" },
    { id: "contactFinished", label: "Contact Finished", description: "Contact completed all sequence steps", defaultEnabled: true },
    { id: "meetingBooked", label: "Meeting Booked", description: "Meeting booked via Reply.io AI", defaultEnabled: true },
  ],
  klenty: [
    { id: "Email Replied", label: "Email Replied", description: "Prospect replied to a Klenty email", defaultEnabled: true },
    { id: "Email Opened", label: "Email Opened", description: "Prospect opened a Klenty email" },
    { id: "Email Clicked", label: "Link Clicked", description: "Prospect clicked a link in email" },
    { id: "Call Completed", label: "Call Completed", description: "Call task completed", defaultEnabled: true },
    { id: "Task Completed", label: "Task Completed", description: "Manual task completed" },
    { id: "Prospect Finished", label: "Prospect Finished", description: "Prospect completed all cadence steps", defaultEnabled: true },
  ],
  // ── CRM ──────────────────────────────────────────────────────────────────
  hubspot: [
    { id: "contact.creation", label: "Contact Created", description: "New contact created in HubSpot", defaultEnabled: true },
    { id: "contact.propertyChange", label: "Contact Updated", description: "Contact property changed (e.g. lifecycle stage)", defaultEnabled: true },
    { id: "contact.deletion", label: "Contact Deleted", description: "Contact removed from HubSpot" },
    { id: "deal.creation", label: "Deal Created", description: "New deal added to pipeline", defaultEnabled: true },
    { id: "deal.propertyChange", label: "Deal Updated", description: "Deal stage, amount, or property changed", defaultEnabled: true },
    { id: "deal.deletion", label: "Deal Deleted", description: "Deal removed from HubSpot" },
    { id: "company.creation", label: "Company Created", description: "New company record created" },
    { id: "company.propertyChange", label: "Company Updated", description: "Company property changed" },
  ],
  pipedrive: [
    { id: "deal.added", label: "Deal Created", description: "New deal added to Pipedrive", defaultEnabled: true },
    { id: "deal.updated", label: "Deal Updated", description: "Deal stage, value, or fields changed", defaultEnabled: true },
    { id: "deal.deleted", label: "Deal Deleted", description: "Deal removed from Pipedrive" },
    { id: "deal.won", label: "Deal Won", description: "Deal marked as Won", defaultEnabled: true },
    { id: "deal.lost", label: "Deal Lost", description: "Deal marked as Lost", defaultEnabled: true },
    { id: "person.added", label: "Contact Created", description: "New person/contact added", defaultEnabled: true },
    { id: "person.updated", label: "Contact Updated", description: "Contact details updated" },
    { id: "organization.added", label: "Organization Created", description: "New company added" },
    { id: "activity.added", label: "Activity Logged", description: "New call, email, or task activity logged" },
    { id: "note.added", label: "Note Added", description: "Note added to deal or contact" },
  ],
  salesforce: [
    { id: "lead.created", label: "Lead Created", description: "New lead record created in Salesforce", defaultEnabled: true },
    { id: "lead.updated", label: "Lead Updated", description: "Lead status, owner, or fields changed", defaultEnabled: true },
    { id: "lead.converted", label: "Lead Converted", description: "Lead converted to Contact + Opportunity", defaultEnabled: true },
    { id: "opportunity.created", label: "Opportunity Created", description: "New opportunity created", defaultEnabled: true },
    { id: "opportunity.updated", label: "Opportunity Updated", description: "Stage, amount, or close date changed", defaultEnabled: true },
    { id: "opportunity.won", label: "Opportunity Won", description: "Opportunity stage set to Closed Won", defaultEnabled: true },
    { id: "contact.created", label: "Contact Created", description: "New contact created" },
    { id: "account.created", label: "Account Created", description: "New account created" },
    { id: "task.completed", label: "Task Completed", description: "Activity task marked complete" },
  ],
  // ── Revenue ───────────────────────────────────────────────────────────────
  stripe: [
    { id: "payment_intent.succeeded", label: "Payment Succeeded", description: "One-time payment successfully charged", defaultEnabled: true },
    { id: "payment_intent.payment_failed", label: "Payment Failed", description: "Payment attempt declined or failed" },
    { id: "customer.subscription.created", label: "Subscription Started", description: "New recurring subscription created", defaultEnabled: true },
    { id: "customer.subscription.updated", label: "Subscription Updated", description: "Plan, quantity, or billing cycle changed", defaultEnabled: true },
    { id: "customer.subscription.deleted", label: "Subscription Canceled", description: "Subscription cancelled or lapsed", defaultEnabled: true },
    { id: "invoice.paid", label: "Invoice Paid", description: "Recurring invoice successfully collected", defaultEnabled: true },
    { id: "invoice.payment_failed", label: "Invoice Payment Failed", description: "Recurring invoice collection failed" },
    { id: "checkout.session.completed", label: "Checkout Completed", description: "Checkout session finished — new purchase or trial start", defaultEnabled: true },
    { id: "customer.created", label: "Customer Created", description: "New Stripe customer record created" },
    { id: "refund.created", label: "Refund Issued", description: "Payment refunded to customer" },
  ],
  chargebee: [
    { id: "subscription_created", label: "Subscription Created", description: "New Chargebee subscription started", defaultEnabled: true },
    { id: "subscription_changed", label: "Subscription Changed", description: "Plan, addons, or billing details changed", defaultEnabled: true },
    { id: "subscription_cancelled", label: "Subscription Cancelled", description: "Subscription cancelled", defaultEnabled: true },
    { id: "subscription_reactivated", label: "Subscription Reactivated", description: "Cancelled subscription restarted" },
    { id: "invoice_generated", label: "Invoice Generated", description: "New invoice created" },
    { id: "payment_succeeded", label: "Payment Succeeded", description: "Payment collected", defaultEnabled: true },
    { id: "payment_failed", label: "Payment Failed", description: "Payment collection failed" },
    { id: "mrr_updated", label: "MRR Updated", description: "Monthly recurring revenue changed" },
  ],
  // ── Automation Platforms ─────────────────────────────────────────────────
  n8n: [
    { id: "workflow.completed", label: "Workflow Completed", description: "n8n workflow execution finished successfully", defaultEnabled: true },
    { id: "workflow.error", label: "Workflow Error", description: "n8n workflow execution failed" },
    { id: "lead_imported", label: "Lead Imported", description: "Automation imported or sourced a new lead", defaultEnabled: true },
    { id: "lead_enriched", label: "Lead Enriched", description: "Automation enriched lead data from a source", defaultEnabled: true },
    { id: "sequence_started", label: "Sequence Started", description: "Automation enrolled a lead into an outreach sequence", defaultEnabled: true },
    { id: "sequence_completed", label: "Sequence Completed", description: "Automation completed all steps for a lead" },
    { id: "meeting_booked", label: "Meeting Booked", description: "Automation detected or booked a meeting", defaultEnabled: true },
    { id: "reply_received", label: "Reply Received", description: "Automation detected a reply from a lead", defaultEnabled: true },
    { id: "deal_created", label: "Deal Created", description: "Automation created a deal in a downstream CRM", defaultEnabled: true },
  ],
  make: [
    { id: "scenario.completed", label: "Scenario Completed", description: "Make scenario run finished successfully", defaultEnabled: true },
    { id: "scenario.error", label: "Scenario Error", description: "Make scenario execution encountered an error" },
    { id: "lead_imported", label: "Lead Imported", description: "Scenario imported or sourced a new lead", defaultEnabled: true },
    { id: "lead_enriched", label: "Lead Enriched", description: "Scenario enriched lead data", defaultEnabled: true },
    { id: "sequence_started", label: "Sequence Started", description: "Scenario enrolled a lead into an outreach sequence", defaultEnabled: true },
    { id: "sequence_completed", label: "Sequence Completed", description: "Scenario completed all steps for a lead" },
    { id: "meeting_booked", label: "Meeting Booked", description: "Scenario detected or booked a meeting", defaultEnabled: true },
    { id: "reply_received", label: "Reply Received", description: "Scenario detected a lead reply", defaultEnabled: true },
    { id: "deal_created", label: "Deal Created", description: "Scenario created a deal in downstream CRM", defaultEnabled: true },
  ],
};

// --- GTM SECTIONS -------------------------------------------------------

const GTM_SECTIONS: GTMSection[] = [
  {
    id: "automation",
    title: "Automation Platforms",
    subtitle: "Connect n8n or Make.com to route any automation workflow event into iqpipe attribution. Fills gaps where a tool isn't directly integrated. Pro+ plan.",
    apps: [
      { id: "n8n",  name: "n8n",      description: "Open-source workflow automation — self-hosted or cloud. Route any tool event into iqpipe via HTTP Request node.", domain: "n8n.io",   status: getStatus("n8n"),  canWebhook: true },
      { id: "make", name: "Make.com", description: "No-code automation platform (formerly Integromat). Track scenario outcomes and lead journeys in iqpipe.",         domain: "make.com", status: getStatus("make"), canWebhook: true },
    ],
  },
  {
    id: "prospecting",
    title: "1. Prospecting & Sourcing",
    subtitle: "Discover and source ICP-fit leads at the top of your funnel.",
    apps: [
      { id: "clay", name: "Clay", description: "Waterfall enrichment & automated lead lists.", domain: "clay.com", status: getStatus("clay"), canSync: true },
      { id: "apollo", name: "Apollo", description: "B2B database with 275M+ verified contacts.", domain: "apollo.io", status: getStatus("apollo"), canSync: true, canWebhook: true },
      { id: "phantombuster", name: "PhantomBuster", description: "Code-free LinkedIn & web automation.", domain: "phantombuster.com", status: getStatus("phantombuster"), canWebhook: true },
    ],
  },
  {
    id: "enrichment",
    title: "2. Enrichment & Data",
    subtitle: "Enrich contacts and companies with verified emails, phones, firmographics, and intent data.",
    apps: [
      { id: "clearbit", name: "Clearbit", description: "Real-time B2B enrichment, reveal, and prospecting.", domain: "clearbit.com", status: getStatus("clearbit"), canSync: true, canWebhook: true },
      { id: "zoominfo", name: "ZoomInfo", description: "Enterprise B2B database with intent signals and org charts.", domain: "zoominfo.com", status: getStatus("zoominfo"), canSync: true, canWebhook: true },
      { id: "pdl", name: "People Data Labs", description: "Person & company enrichment API with 1.5B+ profiles.", domain: "peopledatalabs.com", status: getStatus("pdl"), canSync: true, canWebhook: true },
      { id: "hunter", name: "Hunter.io", description: "Email finder, verifier, and drip outreach campaigns.", domain: "hunter.io", status: getStatus("hunter"), canSync: true, canWebhook: true },
      { id: "lusha", name: "Lusha", description: "B2B contact data with direct dials and verified emails.", domain: "lusha.com", status: getStatus("lusha"), canSync: true, canWebhook: true },
      { id: "cognism", name: "Cognism", description: "GDPR-compliant B2B data with diamond-verified phones.", domain: "cognism.com", status: getStatus("cognism"), canSync: true, canWebhook: true },
      { id: "snovio", name: "Snov.io", description: "Email finder, verifier, and multi-channel drip campaigns.", domain: "snov.io", status: getStatus("snovio"), canSync: true, canWebhook: true },
      { id: "rocketreach", name: "RocketReach", description: "Find emails, phones, and social profiles for any professional.", domain: "rocketreach.co", status: getStatus("rocketreach"), canSync: true, canWebhook: true },
    ],
  },
  {
    id: "linkedin",
    title: "4. LinkedIn Outreach",
    subtitle: "Connection requests, DMs, profile visits, and LinkedIn engagement automation.",
    apps: [
      { id: "heyreach",     name: "HeyReach",    description: "Scalable LinkedIn automation at volume.", domain: "heyreach.io",     status: getStatus("heyreach"),     canSync: true, canWebhook: true },
      { id: "expandi",      name: "Expandi",     description: "Smart LinkedIn outreach with dynamic personalization.", domain: "expandi.io",      status: getStatus("expandi"),      canWebhook: true },
      { id: "dripify",      name: "Dripify",     description: "LinkedIn drip sequences with analytics.", domain: "dripify.io",      status: getStatus("dripify"),      canWebhook: true },
      { id: "waalaxy",      name: "Waalaxy",     description: "LinkedIn + email prospecting in one tool.", domain: "waalaxy.com",     status: getStatus("waalaxy"),      canWebhook: true },
      { id: "meetalfred",   name: "Meet Alfred", description: "Multi-channel LinkedIn, email, and Twitter automation.", domain: "meetalfred.com",  status: getStatus("meetalfred"),   canWebhook: true },
    ],
  },
  {
    id: "email",
    title: "5. Cold Email Outreach",
    subtitle: "Mass personalized outbound email campaigns with deliverability tooling.",
    apps: [
      { id: "smartlead",  name: "Smartlead",  description: "Unlimited mailbox warming & cold email at scale.", domain: "smartlead.ai",  status: getStatus("smartlead"),  canSync: true, canWebhook: true },
      { id: "instantly",  name: "Instantly",  description: "Cold email with AI optimisation.", domain: "instantly.ai",  status: getStatus("instantly"),  canSync: true, canWebhook: true },
      { id: "lemlist",    name: "Lemlist",    description: "Personalised multi-channel outreach.", domain: "lemlist.com",  status: getStatus("lemlist"),    canSync: true, canWebhook: true },
      { id: "mailshake",  name: "Mailshake",  description: "Simple cold email outreach for sales teams.", domain: "mailshake.com",status: getStatus("mailshake"), canWebhook: true },
      { id: "apollo",     name: "Apollo",     description: "Sequences + prospecting from one platform.", domain: "apollo.io",    status: getStatus("apollo"),     canSync: true },
    ],
  },
  {
    id: "calls",
    title: "6. Phone & Calling",
    subtitle: "Cold calling, power dialers, and conversation intelligence for SDR teams.",
    apps: [
      { id: "aircall",  name: "Aircall",  description: "Cloud-based phone system built for sales teams.", domain: "aircall.io",  status: getStatus("aircall"),  canWebhook: true },
      { id: "dialpad",  name: "Dialpad",  description: "AI-powered business phone with call coaching.", domain: "dialpad.com", status: getStatus("dialpad"),  canWebhook: true },
      { id: "kixie",    name: "Kixie",    description: "Power dialer with CRM integrations for high-volume calling.", domain: "kixie.com",   status: getStatus("kixie"),    canWebhook: true },
      { id: "orum",     name: "Orum",     description: "AI-powered parallel dialer to accelerate pipeline.", domain: "orum.io",    status: getStatus("orum"),     canWebhook: true },
    ],
  },
  {
    id: "messaging",
    title: "7. SMS & WhatsApp",
    subtitle: "Direct outreach via mobile messaging channels.",
    apps: [
      { id: "twilio", name: "Twilio", description: "Programmable SMS, WhatsApp, and voice APIs.", domain: "twilio.com", status: getStatus("twilio"), canWebhook: true },
      { id: "sakari", name: "Sakari", description: "Business SMS for sales and marketing teams.", domain: "sakari.io",  status: getStatus("sakari"), canWebhook: true },
      { id: "wati",   name: "WATI",   description: "WhatsApp Business API for outreach and support.", domain: "wati.io",   status: getStatus("wati"),   canWebhook: true },
    ],
  },
  {
    id: "multichannel",
    title: "8. Multichannel Outreach Platforms",
    subtitle: "Tools combining LinkedIn, email, calling, and SMS into unified sequences.",
    apps: [
      { id: "outreach",   name: "Outreach",   description: "Enterprise sales engagement across every channel.", domain: "outreach.io",   status: getStatus("outreach"),   canWebhook: true },
      { id: "salesloft",  name: "Salesloft",  description: "Revenue workflow platform for full-cycle sales.", domain: "salesloft.com", status: getStatus("salesloft"),  canWebhook: true },
      { id: "replyio",    name: "Reply.io",   description: "AI-powered multichannel sales acceleration.", domain: "reply.io",     status: getStatus("replyio"),    canWebhook: true },
      { id: "klenty",     name: "Klenty",     description: "Sales engagement with email, LinkedIn, and calls.", domain: "klenty.com",   status: getStatus("klenty"),     canWebhook: true },
    ],
  },
  {
    id: "crm",
    title: "9. CRM",
    subtitle: "Sync contacts, deals, and pipeline activity to and from your CRM.",
    apps: [
      { id: "hubspot",    name: "HubSpot",    description: "All-in-one CRM with contacts, deals, and sequences.", domain: "hubspot.com",    status: getStatus("hubspot"),    canSync: true, canWebhook: true },
      { id: "pipedrive",  name: "Pipedrive",  description: "Visual sales CRM built for pipeline management.", domain: "pipedrive.com",  status: getStatus("pipedrive"),  canSync: true, canWebhook: true },
      { id: "salesforce", name: "Salesforce", description: "Enterprise CRM with leads, opportunities, and reporting.", domain: "salesforce.com", status: getStatus("salesforce"), canSync: true, canWebhook: true },
    ],
  },
  {
    id: "revenue",
    title: "10. Revenue & Billing",
    subtitle: "Attribute closed revenue to pipeline activities and track subscription health.",
    apps: [
      { id: "stripe",    name: "Stripe",    description: "Payment processing and subscription management.", domain: "stripe.com",    status: getStatus("stripe"),    canSync: true, canWebhook: true },
      { id: "chargebee", name: "Chargebee", description: "Subscription billing, MRR tracking, and churn analytics.", domain: "chargebee.com", status: getStatus("chargebee"), canWebhook: true },
    ],
  },
];

// --- Webhook Events Modal -----------------------------------------------

function WebhookEventsModal({
  provider,
  appName,
  isConnected,
  isOpen,
  onClose,
  onSave,
}: {
  provider: string;
  appName: string;
  isConnected: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSave: (selectedIds: string[]) => void;
}) {
  const events = APP_WEBHOOK_EVENTS[provider] ?? [];
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(events.filter(e => e.defaultEnabled).map(e => e.id))
  );

  // Reset to defaults when provider changes
  useEffect(() => {
    const stored = localStorage.getItem(`iqpipe_events_${provider}`);
    if (stored) {
      try { setSelected(new Set(JSON.parse(stored))); return; } catch {}
    }
    setSelected(new Set(events.filter(e => e.defaultEnabled).map(e => e.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  if (!isOpen) return null;

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll = () => setSelected(new Set(events.map(e => e.id)));
  const selectNone = () => setSelected(new Set());
  const selectDefaults = () => setSelected(new Set(events.filter(e => e.defaultEnabled).map(e => e.id)));

  const handleSave = () => {
    const ids = [...selected];
    localStorage.setItem(`iqpipe_events_${provider}`, JSON.stringify(ids));
    onSave(ids);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-indigo-400" />
              <h2 className="text-sm font-semibold text-slate-100">Configure Webhook Events</h2>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isConnected
                ? <>Choose which <span className="text-slate-300 font-medium">{appName}</span> events iqpipe should record. Only selected events will be tracked.</>
                : <>Preview all <span className="text-slate-300 font-medium">{appName}</span> events iqpipe can capture. Your selection is saved and applied when you connect.</>
              }
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-800/60">
          <span className="text-[10px] text-slate-500 mr-1">Select:</span>
          {[
            { label: "All", fn: selectAll },
            { label: "Recommended", fn: selectDefaults },
            { label: "None", fn: selectNone },
          ].map(({ label, fn }) => (
            <button key={label} onClick={fn}
              className="px-2.5 py-0.5 rounded-full text-[10px] border border-slate-700 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 transition-colors">
              {label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-slate-500">
            {selected.size} / {events.length} selected
          </span>
        </div>

        {/* Event list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {events.length === 0 ? (
            <p className="text-[11px] text-slate-500 py-4 text-center">
              No webhook events configured for {appName} yet.
            </p>
          ) : (
            events.map(ev => (
              <label key={ev.id}
                className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  selected.has(ev.id)
                    ? "border-indigo-500/40 bg-indigo-500/8"
                    : "border-slate-800 hover:border-slate-700 bg-slate-950/50"
                }`}>
                <input
                  type="checkbox"
                  checked={selected.has(ev.id)}
                  onChange={() => toggle(ev.id)}
                  className="mt-0.5 w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-slate-200">{ev.label}</span>
                    {ev.defaultEnabled && (
                      <span className="px-1.5 py-0 rounded-full text-[9px] bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                        recommended
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{ev.description}</p>
                  <code className="text-[9px] text-slate-600 font-mono">{ev.id}</code>
                </div>
              </label>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-full text-[11px] text-slate-400 hover:text-slate-200 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-4 py-1.5 rounded-full bg-indigo-600 text-[11px] text-white hover:bg-indigo-500 transition-colors font-medium">
            Save {selected.size} event{selected.size !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const { markConnected, markDisconnected } = useIntegrations();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [wsLoading, setWsLoading] = useState(true);
  const [wsError, setWsError] = useState<string | null>(null);

  // Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const [statusMap, setStatusMap] = useState<Record<string, IntegrationStatus>>({});
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [errorProvider, setErrorProvider] = useState<string | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, { imported: number; ts: string }>>({});
  const [syncError, setSyncError] = useState<string | null>(null);

  // Vault state
  const [vaultOpen, setVaultOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // Setup instruction panels (expanded per tool id)
  const [expandedSetup, setExpandedSetup] = useState<Record<string, boolean>>({});

  // Webhook URL panels (expanded per tool id) + copy confirmation
  const [expandedWebhook, setExpandedWebhook] = useState<Record<string, boolean>>({});
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);

  // Webhook events modal
  const [eventsModalOpen, setEventsModalOpen] = useState(false);
  const [eventsModalProvider, setEventsModalProvider] = useState<string | null>(null);
  const [eventsModalAppName, setEventsModalAppName] = useState("");

  const openEventsModal = (providerId: string, appName: string) => {
    setEventsModalProvider(providerId);
    setEventsModalAppName(appName);
    setEventsModalOpen(true);
  };

  // HeyReach auto-webhook setup
  type HRResult = { eventType: string; ok: boolean; error?: string };
  const [hrSetupLoading, setHrSetupLoading] = useState(false);
  const [hrSetupDone, setHrSetupDone] = useState(false);
  const [hrSetupStats, setHrSetupStats] = useState<{ registered: number; failed: number; total: number } | null>(null);
  const [hrSetupResults, setHrSetupResults] = useState<HRResult[]>([]);
  const [hrSetupError, setHrSetupError] = useState<string | null>(null);

  // Bulk selection + sync
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [bulkSyncing, setBulkSyncing] = useState(false);

  const getWebhookUrl = (providerId: string) =>
    `${API_BASE_URL}/api/webhooks/${providerId}?workspaceId=${workspaceId ?? "YOUR_WORKSPACE_ID"}`;

  const copyWebhookUrl = (providerId: string) => {
    navigator.clipboard.writeText(getWebhookUrl(providerId)).then(() => {
      setCopiedWebhook(providerId);
      setTimeout(() => setCopiedWebhook(null), 2000);
    });
  };

  const getHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("iqpipe_token")}`,
  });


  // Fetch workspace ID — returns the id or null
  const fetchWorkspaceId = async (): Promise<string | null> => {
    const token = localStorage.getItem("iqpipe_token");
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/workspaces/primary`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setWorkspaceId(data.id);
        setWsError(null);
        return data.id as string;
      }
      setWsError("Could not load workspace. Check your connection and refresh.");
      return null;
    } catch {
      setWsError("Could not reach the server. Make sure the backend is running.");
      return null;
    }
  };

  // 1. Fetch Workspace ID on mount
  useEffect(() => {
    setWsLoading(true);
    fetchWorkspaceId().finally(() => setWsLoading(false));
  }, []);

  const openVault = (providerId: string) => {
    setSelectedProvider(providerId);
    setVaultOpen(true);
  };

  const closeVault = () => {
    setSelectedProvider(null);
    setVaultOpen(false);
  };

  // 2. Check Status
  const handleCheckConnection = async (providerId: string) => {
    if (!workspaceId) return;
    setLoadingProvider(providerId);
    setErrorProvider(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/integrations/${providerId}/check`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ workspaceId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Connection check failed");
      }

      const data = await res.json();
      setStatusMap((prev) => ({ ...prev, [data.provider]: data.status }));
    } catch (err) {
      console.error(err);
      setErrorProvider(providerId);
      setStatusMap((prev) => ({ ...prev, [providerId]: "not_connected" }));
    } finally {
      setLoadingProvider(null);
    }
  };

  // 3. Disconnect
  const handleDisconnect = async (providerId: string) => {
    if (!workspaceId) return;
    setLoadingProvider(providerId);
    setErrorProvider(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/integrations/${providerId}/disconnect`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ workspaceId }),
      });

      if (!res.ok) throw new Error("Disconnect failed");

      const data = await res.json();
      setStatusMap((prev) => ({ ...prev, [data.provider]: data.status }));
      markDisconnected(providerId);
    } catch (err) {
      console.error(err);
      setErrorProvider(providerId);
    } finally {
      setLoadingProvider(null);
    }
  };

  // 4. Pull data from tool's API or webhook history
  const handleSync = async (providerId: string) => {
    if (!workspaceId) return;
    setSyncingProvider(providerId);
    setSyncError(null);
    const isWebhookTool = WEBHOOK_EVENT_TOOLS.has(providerId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/integrations/${providerId}/sync`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ workspaceId, mode: isWebhookTool ? "webhook" : "api" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pull failed");
      setSyncResult(prev => ({ ...prev, [providerId]: { imported: data.imported ?? 0, ts: new Date().toLocaleTimeString() } }));
    } catch (err: any) {
      console.error(err);
      setSyncError(providerId);
    } finally {
      setSyncingProvider(null);
    }
  };

  // 4b. Pull data from all selected apps
  const handleBulkSync = async () => {
    if (!workspaceId || bulkSyncing) return;
    const syncableIds = [...selectedApps].filter(id => {
      const app = GTM_SECTIONS.flatMap(s => s.apps).find(a => a.id === id);
      return app?.canSync;
    });
    if (!syncableIds.length) return;
    setBulkSyncing(true);
    await Promise.all(syncableIds.map(id => handleSync(id)));
    setBulkSyncing(false);
    setSelectedApps(new Set());
  };

  const toggleAppSelection = (appId: string) => {
    setSelectedApps(prev => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId); else next.add(appId);
      return next;
    });
  };

  const handleHeyReachSetupWebhooks = async () => {
    if (!workspaceId || hrSetupLoading) return;
    setHrSetupLoading(true);
    setHrSetupError(null);
    setHrSetupDone(false);
    setHrSetupResults([]);
    setHrSetupStats(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/integrations/heyreach/setup-all-webhooks`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ workspaceId, webhookUrl: getWebhookUrl("heyreach") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      setHrSetupResults(data.results ?? []);
      setHrSetupStats({ registered: data.registered, failed: data.failed, total: data.total });
      setHrSetupDone(true);
    } catch (err: any) {
      setHrSetupError(err.message);
    } finally {
      setHrSetupLoading(false);
    }
  };

  // 5. Save Credentials (Vault)
  const handleVaultSave = async (secrets: Record<string, string>) => {
    if (!selectedProvider) return;

    closeVault();
    setLoadingProvider(selectedProvider);
    setErrorProvider(null);

    try {
      // If workspaceId isn't loaded yet, try fetching it now
      const wsId = workspaceId ?? await fetchWorkspaceId();
      if (!wsId) {
        throw new Error("Workspace not available. Make sure the server is running and refresh.");
      }

      const res = await fetch(`${API_BASE_URL}/api/integrations/${selectedProvider}/check`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ workspaceId: wsId, ...secrets }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to connect. Check credentials.");
      }

      const data = await res.json();
      setStatusMap((prev) => ({ ...prev, [data.provider]: data.status }));
      if (data.status === "connected") {
        markConnected(data.provider);
        // Auto-open events picker if this app has configurable events
        if (APP_WEBHOOK_EVENTS[data.provider]?.length) {
          const allApps = GTM_SECTIONS.flatMap(s => s.apps);
          const appName = allApps.find(a => a.id === data.provider)?.name ?? data.provider;
          openEventsModal(data.provider, appName);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorProvider(selectedProvider);
      setWsError(err.message);
    } finally {
      setLoadingProvider(null);
    }
  };

  // 5. Fetch Initial Statuses
  useEffect(() => {
    const fetchStatuses = async () => {
      if (!workspaceId) return;
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/integrations?workspaceId=${encodeURIComponent(workspaceId)}`,
          { headers: getHeaders() }
        );
        if (!res.ok) throw new Error("Failed to load integrations");

        const data: { provider: string; status: IntegrationStatus }[] = await res.json();
        const next: Record<string, IntegrationStatus> = {};
        data.forEach((row) => {
          next[row.provider] = row.status;
        });

        setStatusMap(next);
      } catch (err) {
        console.error(err);
      }
    };

    fetchStatuses();
  }, [workspaceId]);

  const getEffectiveStatus = (app: IntegrationApp): IntegrationStatus =>
    statusMap[app.id] ?? app.status;

  // --- Filtering Logic ---
  const filteredSections = useMemo(() => {
    return GTM_SECTIONS.map(section => {
      // 1. Check Category Filter
      if (selectedCategory !== "all" && section.id !== selectedCategory) {
        return null;
      }

      // 2. Check Search Filter (on Apps)
      const matchesSearch = section.apps.filter(app => 
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        app.description.toLowerCase().includes(searchQuery.toLowerCase())
      );

      // If search query exists but no apps match, hide section
      if (searchQuery && matchesSearch.length === 0) {
        return null;
      }

      // Return section with filtered apps
      return {
        ...section,
        apps: matchesSearch
      };
    }).filter((section): section is GTMSection => section !== null);
  }, [selectedCategory, searchQuery]);


  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Connect iqpipe with your GTM stack across every step of the funnel."
      />

      {/* Workspace error banner */}
      {wsError && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>{wsError}</span>
          <button
            onClick={() => { setWsError(null); setWsLoading(true); fetchWorkspaceId().finally(() => setWsLoading(false)); }}
            className="ml-auto shrink-0 underline hover:text-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* --- Search & Filter Controls --- */}
      <div className="mt-6 flex flex-col sm:flex-row gap-4">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            placeholder="Search integrations (e.g. Clay, HeyReach, Smartlead)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
          />
        </div>

        {/* Category Dropdown */}
        <div className="relative w-full sm:w-64">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none cursor-pointer transition-all"
          >
            <option value="all">All Categories</option>
            {GTM_SECTIONS.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          {/* Custom Arrow for select */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
            <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>
      </div>

      {/* --- Bulk Sync Action Bar --- */}
      {selectedApps.size > 0 && (
        <div className="mt-4 flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10">
          <span className="text-xs text-indigo-300">
            {selectedApps.size} app{selectedApps.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedApps(new Set())}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleBulkSync}
              disabled={bulkSyncing || !workspaceId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 text-[11px] text-white hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {bulkSyncing
                ? "Pulling data..."
                : `Pull from ${selectedApps.size} app${selectedApps.size > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* --- Content --- */}
      <div className="mt-6 space-y-6">
        {filteredSections.length > 0 ? (
          filteredSections.map((section) => (
            <div
              key={section.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-100">
                    {section.title}
                  </h2>
                  {section.id === "automation" && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-400">
                      Pro+
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">{section.subtitle}</p>
              </div>

              <div className="space-y-2">
                {section.apps.map((app) => {
                  const status = getEffectiveStatus(app);
                  const isLoading = loadingProvider === app.id;
                  const hasError = errorProvider === app.id;
                  const setupInfo = TOOL_SETUP_INSTRUCTIONS[app.id];
                  const isExpanded = expandedSetup[app.id] ?? false;
                  const needsSetup = status === "connected" && !!setupInfo;
                  const webhookInfo = WEBHOOK_INSTRUCTIONS[app.id];
                  const isWebhookExpanded = expandedWebhook[app.id] ?? false;
                  const needsWebhook = status === "connected" && !!app.canWebhook && !!webhookInfo;
                  const hasBottomPanel = (needsSetup && isExpanded) || (needsWebhook && isWebhookExpanded);

                  return (
                    <div key={app.id} className="space-y-0">
                      <div
                        className={
                          "flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border bg-slate-950/70 px-3 py-2.5 text-xs " +
                          (hasBottomPanel
                            ? "border-slate-700/60 rounded-b-none"
                            : needsSetup
                              ? "border-amber-500/30"
                              : "border-slate-800")
                        }
                      >
                        <div className="flex items-center gap-3">
                          {status === "connected" && (
                            <input
                              type="checkbox"
                              checked={selectedApps.has(app.id)}
                              onChange={() => toggleAppSelection(app.id)}
                              className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer shrink-0"
                            />
                          )}
                          <ToolLogo domain={app.domain} name={app.name} />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-100 font-medium">{app.name}</span>
                              {app.canSync && app.canWebhook && (
                                <span className="px-1.5 py-0 rounded-full text-[9px] font-semibold bg-fuchsia-500/10 border border-fuchsia-500/25 text-fuchsia-400 leading-5">
                                  API + Webhook
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {app.description}
                            </div>
                            {hasError && (
                              <div className="mt-1 text-[10px] text-rose-300">
                                Connection failed. Check credentials.
                              </div>
                            )}
                            {syncError === app.id && !hasError && (
                              <div className="mt-1 text-[10px] text-amber-400">
                                Pull failed. Try again or check your plan limits.
                              </div>
                            )}
                            {syncResult[app.id] && !syncError && (
                              <div className="mt-1 text-[10px] text-emerald-400">
                                {syncResult[app.id].imported} record{syncResult[app.id].imported !== 1 ? "s" : ""} pulled at {syncResult[app.id].ts}
                              </div>
                            )}
                            {syncingProvider === app.id && (
                              <div className="mt-1 text-[10px] text-indigo-300">
                                Pulling from API — cross-checking against webhook events…
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {needsSetup && (
                            <button
                              onClick={() => setExpandedSetup(p => ({ ...p, [app.id]: !p[app.id] }))}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 hover:bg-amber-500/20 transition-colors"
                            >
                              <AlertTriangle size={10} />
                              Setup required
                              {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                            </button>
                          )}

                          {needsWebhook && (
                            <button
                              onClick={() => setExpandedWebhook(p => ({ ...p, [app.id]: !p[app.id] }))}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-[10px] text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                            >
                              <Zap size={10} />
                              Webhook
                              {isWebhookExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                            </button>
                          )}

                          {APP_WEBHOOK_EVENTS[app.id]?.length > 0 && (() => {
                            const events = APP_WEBHOOK_EVENTS[app.id];
                            const saved = localStorage.getItem(`iqpipe_events_${app.id}`);
                            const selectedCount = saved
                              ? JSON.parse(saved).length
                              : events.filter(e => e.defaultEnabled).length;
                            const totalCount = events.length;
                            const isConnected = status === "connected";
                            return (
                              <button
                                onClick={() => openEventsModal(app.id, app.name)}
                                title={isConnected
                                  ? `${selectedCount} of ${totalCount} events active — click to configure`
                                  : `${totalCount} available events — configure before connecting`}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] transition-colors border ${
                                  isConnected
                                    ? "bg-violet-500/10 border-violet-500/30 text-violet-300 hover:bg-violet-500/20"
                                    : "bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                                }`}
                              >
                                <Bell size={10} />
                                {isConnected
                                  ? `${selectedCount} / ${totalCount} event${totalCount !== 1 ? "s" : ""}`
                                  : `${totalCount} event${totalCount !== 1 ? "s" : ""}`}
                              </button>
                            );
                          })()}

                          <span
                            className={
                              "px-2.5 py-1 rounded-full text-[10px] font-medium border " +
                              (status === "connected"
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/50"
                                : "bg-slate-800 text-slate-300 border-slate-700")
                            }
                          >
                            {status === "connected" ? "Connected" : "Not connected"}
                          </span>

                          {status === "not_connected" && (
                            <button
                              onClick={() => openVault(app.id)}
                              disabled={isLoading || wsLoading}
                              className="px-3 py-1.5 rounded-full bg-indigo-600 text-[11px] text-white hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {wsLoading ? "Loading..." : isLoading ? "Connecting..." : "Connect"}
                            </button>
                          )}

                          {status === "connected" && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {app.canSync && (
                                <button
                                  onClick={() => handleSync(app.id)}
                                  disabled={syncingProvider === app.id || !workspaceId}
                                  title={app.canWebhook ? "Pull from API now — catches any events missed by webhook" : "Pull latest events from API"}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-700/80 text-[11px] text-indigo-100 hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                >
                                  <RefreshCw size={10} className={syncingProvider === app.id ? "animate-spin" : ""} />
                                  {syncingProvider === app.id ? "Pulling…" : app.canWebhook ? "Pull now" : "Sync"}
                                </button>
                              )}

                              <button
                                onClick={() => handleCheckConnection(app.id)}
                                disabled={isLoading || !workspaceId}
                                className="px-3 py-1.5 rounded-full bg-slate-800 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-60"
                              >
                                {isLoading ? "Checking..." : "Check"}
                              </button>

                              <button
                                onClick={() => handleDisconnect(app.id)}
                                disabled={isLoading || !workspaceId}
                                className="px-3 py-1.5 rounded-full bg-rose-700/90 text-[11px] text-rose-50 hover:bg-rose-600 disabled:opacity-60"
                              >
                                {isLoading ? "..." : "Disconnect"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Setup instruction panel */}
                      {needsSetup && isExpanded && setupInfo && (
                        <div className={
                          "border border-t-0 bg-amber-500/5 px-4 py-3 space-y-3 " +
                          (needsWebhook && isWebhookExpanded
                            ? "border-slate-700/60"
                            : "border-amber-500/30 rounded-b-xl")
                        }>
                          <p className="text-[11px] text-amber-200 font-medium flex items-center gap-1.5">
                            <AlertTriangle size={11} />
                            {setupInfo.headline}
                          </p>
                          <ol className="space-y-2">
                            {setupInfo.steps.map((step, i) => (
                              <li key={i} className="flex items-start gap-2.5">
                                <span className="shrink-0 w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold flex items-center justify-center mt-0.5">
                                  {i + 1}
                                </span>
                                <div>
                                  <span className="text-[11px] text-slate-200 font-medium">{step.label}</span>
                                  <p className="text-[10px] text-slate-400 mt-0.5">{step.detail}</p>
                                  {step.docUrl && (
                                    <a
                                      href={step.docUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 mt-1 text-[10px] text-indigo-400 hover:text-indigo-300"
                                    >
                                      View docs <ExternalLink size={9} />
                                    </a>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ol>
                          <div className="pt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                            <CheckCircle2 size={10} />
                            Mark as complete once all steps are done — iqpipe will verify on next Check.
                          </div>
                        </div>
                      )}

                      {/* Webhook URL panel */}
                      {needsWebhook && isWebhookExpanded && webhookInfo && (
                        <div className="border border-t-0 border-indigo-500/20 rounded-b-xl bg-indigo-500/5 px-4 py-3 space-y-3">
                          <p className="text-[11px] text-indigo-200 font-medium flex items-center gap-1.5">
                            <Zap size={11} />
                            Paste this URL into {app.name} to start receiving real-time events
                          </p>

                          {/* URL copy row */}
                          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60">
                            <code className="flex-1 text-[10px] text-slate-300 font-mono truncate select-all">
                              {getWebhookUrl(app.id)}
                            </code>
                            <button
                              onClick={() => copyWebhookUrl(app.id)}
                              className="flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-md bg-indigo-600/80 text-[10px] text-indigo-100 hover:bg-indigo-500 transition-colors"
                            >
                              {copiedWebhook === app.id
                                ? <><Check size={10} className="text-emerald-300" /> Copied!</>
                                : <><Copy size={10} /> Copy URL</>
                              }
                            </button>
                          </div>

                          {/* Where to paste */}
                          <div className="space-y-1.5">
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 text-[10px] text-slate-500 mt-0.5 w-14">Navigate</span>
                              <span className="text-[10px] text-slate-300 font-mono">{webhookInfo.where}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 text-[10px] text-slate-500 mt-0.5 w-14">Subscribe</span>
                              <span className="text-[10px] text-slate-300">{webhookInfo.events}</span>
                            </div>
                            {webhookInfo.note && (
                              <div className="flex items-start gap-2">
                                <span className="shrink-0 text-[10px] text-amber-500 mt-0.5 w-14">Note</span>
                                <span className="text-[10px] text-amber-300/80">{webhookInfo.note}</span>
                              </div>
                            )}
                          </div>

                          {/* Dual-ingestion notice for tools with both API + Webhook */}
                          {app.canSync && app.canWebhook && (
                            <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 px-3 py-2.5 space-y-1">
                              <p className="text-[11px] text-fuchsia-200 font-semibold flex items-center gap-1.5">
                                <Zap size={10} className="text-fuchsia-400" />
                                Dual ingestion active — both required
                              </p>
                              <p className="text-[10px] text-slate-400 leading-relaxed">
                                Configure the webhook URL above <strong className="text-slate-300">and</strong> connect your API key via the Connect button.
                                Webhooks deliver events in real-time. iqpipe also pulls from the {app.name} API every 2 hours to catch any event that may have been missed.
                                All events are cross-checked and deduplicated — no double-counting.
                              </p>
                            </div>
                          )}

                          {/* HeyReach: One-click auto-register all 12 event types */}
                          {app.id === "heyreach" && (
                            <div className="mt-1 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/5 px-3 py-3 space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-[11px] text-fuchsia-200 font-semibold">Auto-register all events</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    Creates all 12 webhooks in HeyReach in one click — covers every event type across all campaigns.
                                  </p>
                                </div>
                                <button
                                  onClick={hrSetupDone
                                    ? () => { setHrSetupDone(false); setHrSetupStats(null); setHrSetupResults([]); setHrSetupError(null); }
                                    : handleHeyReachSetupWebhooks}
                                  disabled={hrSetupLoading || !workspaceId}
                                  className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full bg-fuchsia-600 text-[11px] text-white hover:bg-fuchsia-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                >
                                  {hrSetupLoading
                                    ? <><Loader2 size={11} className="animate-spin" /> Registering…</>
                                    : hrSetupDone
                                      ? <><RefreshCw size={11} /> Re-run</>
                                      : <><Zap size={11} /> Register all events</>
                                  }
                                </button>
                              </div>

                              {hrSetupError && (
                                <div className="flex items-center gap-1.5 text-[10px] text-rose-300">
                                  <XCircle size={11} className="shrink-0" /> {hrSetupError}
                                </div>
                              )}

                              {hrSetupDone && hrSetupStats && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-3 text-[11px]">
                                    <span className="flex items-center gap-1 text-emerald-300">
                                      <CheckCircle2 size={11} /> {hrSetupStats.registered} registered
                                    </span>
                                    {hrSetupStats.failed > 0 && (
                                      <span className="flex items-center gap-1 text-rose-300">
                                        <XCircle size={11} /> {hrSetupStats.failed} failed
                                      </span>
                                    )}
                                    <span className="text-slate-500">of {hrSetupStats.total} event types</span>
                                  </div>
                                  <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
                                    {hrSetupResults.map((r, i) => (
                                      <div key={i} className="flex items-center gap-2">
                                        {r.ok
                                          ? <CheckCircle2 size={10} className="shrink-0 text-emerald-400" />
                                          : <XCircle size={10} className="shrink-0 text-rose-400" />
                                        }
                                        <span className="text-[10px] text-slate-300 font-mono">{r.eventType}</span>
                                        {!r.ok && r.error && (
                                          <span className="ml-auto text-[10px] text-rose-300/70 truncate max-w-[180px]" title={r.error}>
                                            {r.error}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {webhookInfo.docUrl && (
                            <a
                              href={webhookInfo.docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
                            >
                              View {app.name} webhook docs <ExternalLink size={9} />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-500 text-sm">No integrations found matching your search.</p>
          </div>
        )}
      </div>

      <VaultModal
        provider={selectedProvider || ""}
        isOpen={vaultOpen}
        onClose={closeVault}
        onSave={handleVaultSave}
      />

      <WebhookEventsModal
        provider={eventsModalProvider ?? ""}
        appName={eventsModalAppName}
        isConnected={(statusMap[eventsModalProvider ?? ""] ?? "not_connected") === "connected"}
        isOpen={eventsModalOpen}
        onClose={() => setEventsModalOpen(false)}
        onSave={() => {}}
      />
    </div>
  );
}