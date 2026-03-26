/**
 * eventTaxonomy.ts
 *
 * Canonical GTM event schema for iqpipe.
 *
 * Every event arriving from n8n, Make.com, webhooks, or any other source
 * is normalised to one of these canonical keys before being stored.
 * This means "received_email", "received_message", "email_replied",
 * "reply", "replied" and so on all resolve to a single key: "reply_received".
 *
 * Funnel positions (1–100) allow cross-workflow success rate calculation:
 *   success_rate(A → B) = unique_contacts_that_reached_B / unique_contacts_at_A
 */

// ── Canonical event definitions ───────────────────────────────────────────────

export const CANONICAL_EVENTS = {
  // ── Sourcing ──────────────────────────────────────────────────────────────
  contact_sourced:       { label: "Contact Sourced",        category: "sourcing",    funnelPos: 5  },
  contact_enriched:      { label: "Contact Enriched",       category: "sourcing",    funnelPos: 10 },
  list_added:            { label: "Added to List",          category: "sourcing",    funnelPos: 12 },

  // ── Outreach (sent) ───────────────────────────────────────────────────────
  email_sent:            { label: "Email Sent",             category: "outreach",    funnelPos: 20 },
  linkedin_sent:         { label: "LinkedIn Message Sent",  category: "outreach",    funnelPos: 21 },
  connection_sent:       { label: "Connection Request Sent",category: "outreach",    funnelPos: 22 },
  call_placed:           { label: "Call Placed",            category: "outreach",    funnelPos: 23 },
  sms_sent:              { label: "SMS Sent",               category: "outreach",    funnelPos: 24 },
  sequence_enrolled:     { label: "Enrolled in Sequence",   category: "outreach",    funnelPos: 18 },

  // ── Engagement (received / positive signal) ───────────────────────────────
  email_opened:          { label: "Email Opened",           category: "engagement",  funnelPos: 30 },
  email_clicked:         { label: "Email Clicked",          category: "engagement",  funnelPos: 32 },
  connection_accepted:   { label: "Connection Accepted",    category: "engagement",  funnelPos: 35 },
  reply_received:        { label: "Reply Received",         category: "engagement",  funnelPos: 40 },
  call_answered:         { label: "Call Answered",          category: "engagement",  funnelPos: 41 },
  voicemail_left:        { label: "Voicemail Left",         category: "engagement",  funnelPos: 28 },
  meeting_booked:        { label: "Meeting Booked",         category: "engagement",  funnelPos: 50 },
  meeting_completed:     { label: "Meeting Completed",      category: "engagement",  funnelPos: 55 },

  // ── Pipeline ──────────────────────────────────────────────────────────────
  contact_created:       { label: "Contact Created (CRM)",  category: "pipeline",    funnelPos: 58 },
  contact_updated:       { label: "Contact Updated (CRM)",  category: "pipeline",    funnelPos: 59 },
  deal_created:          { label: "Deal Created",           category: "pipeline",    funnelPos: 60 },
  deal_stage_changed:    { label: "Deal Stage Changed",     category: "pipeline",    funnelPos: 65 },
  deal_closed_won:       { label: "Deal Won",               category: "pipeline",    funnelPos: 80 },
  deal_closed_lost:      { label: "Deal Lost",              category: "pipeline",    funnelPos: 70 },

  // ── Revenue ───────────────────────────────────────────────────────────────
  trial_started:         { label: "Trial Started",          category: "revenue",     funnelPos: 82 },
  subscription_created:  { label: "Subscription Created",   category: "revenue",     funnelPos: 85 },
  subscription_upgraded: { label: "Subscription Upgraded",  category: "revenue",     funnelPos: 88 },
  subscription_cancelled:{ label: "Subscription Cancelled", category: "revenue",     funnelPos: 72 },
  payment_received:      { label: "Payment Received",       category: "revenue",     funnelPos: 90 },
  payment_failed:        { label: "Payment Failed",         category: "revenue",     funnelPos: 71 },
} as const;

export type CanonicalEventKey = keyof typeof CANONICAL_EVENTS;

export interface CanonicalEventMeta {
  label:      string;
  category:   "sourcing" | "outreach" | "engagement" | "pipeline" | "revenue";
  funnelPos:  number;
}

// ── Alias map: raw string → canonical key ─────────────────────────────────────
// Keys are already normalised (lowercase, underscores).
// Add as many real-world variants as you encounter — the normaliser will
// also do keyword matching as a second pass.

const ALIASES: Record<string, CanonicalEventKey> = {

  // ─ reply_received ──────────────────────────────────────────────────────────
  reply:                      "reply_received",
  replied:                    "reply_received",
  reply_received:             "reply_received",
  reply_detected:             "reply_received",
  email_reply:                "reply_received",
  email_replied:              "reply_received",
  inbound_email:              "reply_received",
  inbound_message:            "reply_received",
  received_email:             "reply_received",
  received_message:           "reply_received",
  received_reply:             "reply_received",
  message_received:           "reply_received",
  response_received:          "reply_received",
  got_reply:                  "reply_received",
  prospect_replied:           "reply_received",
  lead_replied:               "reply_received",
  contact_replied:            "reply_received",
  linkedin_reply:             "reply_received",
  linkedin_replied:           "reply_received",
  linkedin_message_received:  "reply_received",
  sms_reply:                  "reply_received",
  sms_replied:                "reply_received",
  sms_received:               "reply_received",
  sms_response:               "reply_received",
  chat_reply:                 "reply_received",
  chat_message_received:      "reply_received",
  whatsapp_reply:             "reply_received",
  whatsapp_received:          "reply_received",

  // ─ email_sent ──────────────────────────────────────────────────────────────
  sent:                       "email_sent",
  email_sent:                 "email_sent",
  send_email:                 "email_sent",
  email_send:                 "email_sent",
  email_delivered:            "email_sent",
  email_queued:               "email_sent",
  outbound_email:             "email_sent",
  message_sent:               "email_sent",
  contacted:                  "email_sent",
  email_dispatched:           "email_sent",
  email_out:                  "email_sent",
  email_created:              "email_sent",

  // ─ email_opened ────────────────────────────────────────────────────────────
  opened:                     "email_opened",
  email_opened:               "email_opened",
  email_open:                 "email_opened",
  open:                       "email_opened",
  open_tracked:               "email_opened",
  email_view:                 "email_opened",
  email_viewed:               "email_opened",

  // ─ email_clicked ───────────────────────────────────────────────────────────
  clicked:                    "email_clicked",
  email_clicked:              "email_clicked",
  email_click:                "email_clicked",
  link_clicked:               "email_clicked",
  cta_clicked:                "email_clicked",

  // ─ linkedin_sent ───────────────────────────────────────────────────────────
  linkedin_message_sent:      "linkedin_sent",
  linkedin_sent:              "linkedin_sent",
  linkedin_outreach:          "linkedin_sent",
  linkedin_msg_sent:          "linkedin_sent",
  inmessage_sent:             "linkedin_sent",
  inmail_sent:                "linkedin_sent",

  // ─ connection_sent ─────────────────────────────────────────────────────────
  connection_request_sent:    "connection_sent",
  connection_sent:            "connection_sent",
  invite_sent:                "connection_sent",
  connection_invite:          "connection_sent",
  linkedin_connection_sent:   "connection_sent",

  // ─ connection_accepted ─────────────────────────────────────────────────────
  connection_accepted:        "connection_accepted",
  accepted:                   "connection_accepted",
  invite_accepted:            "connection_accepted",
  connection_approved:        "connection_accepted",
  connected:                  "connection_accepted",

  // ─ call_placed ─────────────────────────────────────────────────────────────
  call_placed:                "call_placed",
  call_initiated:             "call_placed",
  call_started:               "call_placed",
  call_dialed:                "call_placed",
  outbound_call:              "call_placed",
  called:                     "call_placed",

  // ─ call_answered ───────────────────────────────────────────────────────────
  call_answered:              "call_answered",
  call_completed:             "call_answered",
  call_ended:                 "call_answered",
  call_done:                  "call_answered",
  call_connected:             "call_answered",
  answered:                   "call_answered",

  // ─ sms_sent ────────────────────────────────────────────────────────────────
  sms_sent:                   "sms_sent",
  sms_delivered:              "sms_sent",
  text_sent:                  "sms_sent",
  text_message_sent:          "sms_sent",
  whatsapp_sent:              "sms_sent",

  // ─ meeting_booked ──────────────────────────────────────────────────────────
  meeting_booked:             "meeting_booked",
  meeting:                    "meeting_booked",
  meeting_scheduled:          "meeting_booked",
  meeting_created:            "meeting_booked",
  meeting_set:                "meeting_booked",
  demo_booked:                "meeting_booked",
  demo_scheduled:             "meeting_booked",
  demo_set:                   "meeting_booked",
  appointment_booked:         "meeting_booked",
  appointment_scheduled:      "meeting_booked",
  appointment_created:        "meeting_booked",
  call_booked:                "meeting_booked",
  calendar_event_created:     "meeting_booked",
  booked:                     "meeting_booked",
  calendly_event_created:     "meeting_booked",
  chili_piper_booked:         "meeting_booked",

  // ─ meeting_completed ───────────────────────────────────────────────────────
  meeting_completed:          "meeting_completed",
  meeting_held:               "meeting_completed",
  meeting_done:               "meeting_completed",
  demo_completed:             "meeting_completed",
  demo_held:                  "meeting_completed",
  call_completed_meeting:     "meeting_completed",

  // ─ contact_sourced ─────────────────────────────────────────────────────────
  contact_sourced:            "contact_sourced",
  sourced:                    "contact_sourced",
  prospected:                 "contact_sourced",
  lead_created:               "contact_sourced",
  lead_added:                 "contact_sourced",
  contact_added:              "contact_sourced",
  prospect_added:             "contact_sourced",
  exported:                   "contact_sourced",
  scraped:                    "contact_sourced",

  // ─ contact_enriched ────────────────────────────────────────────────────────
  contact_enriched:           "contact_enriched",
  enriched:                   "contact_enriched",
  enrich:                     "contact_enriched",
  data_enriched:              "contact_enriched",
  profile_enriched:           "contact_enriched",
  contact_updated_enrich:     "contact_enriched",

  // ─ sequence_enrolled ───────────────────────────────────────────────────────
  sequence_enrolled:          "sequence_enrolled",
  enrolled:                   "sequence_enrolled",
  added_to_sequence:          "sequence_enrolled",
  sequence_started:           "sequence_enrolled",
  campaign_enrolled:          "sequence_enrolled",
  added_to_campaign:          "sequence_enrolled",
  sequence_added:             "sequence_enrolled",

  // ─ contact_created (CRM) ───────────────────────────────────────────────────
  contact_created:            "contact_created",
  crm_contact_created:        "contact_created",
  new_contact:                "contact_created",
  hubspot_contact_created:    "contact_created",
  sf_lead_created:            "contact_created",
  lead_converted:             "contact_created",

  // ─ contact_updated ─────────────────────────────────────────────────────────
  contact_updated:            "contact_updated",
  crm_updated:                "contact_updated",
  contact_properties_updated: "contact_updated",
  record_updated:             "contact_updated",

  // ─ deal_created ────────────────────────────────────────────────────────────
  deal_created:               "deal_created",
  opportunity_created:        "deal_created",
  deal_new:                   "deal_created",
  new_deal:                   "deal_created",
  pipeline_entry:             "deal_created",
  added_to_pipeline:          "deal_created",

  // ─ deal_stage_changed ──────────────────────────────────────────────────────
  deal_stage_changed:         "deal_stage_changed",
  stage_changed:              "deal_stage_changed",
  deal_updated:               "deal_stage_changed",
  deal_moved:                 "deal_stage_changed",
  opportunity_stage_changed:  "deal_stage_changed",
  pipeline_stage_changed:     "deal_stage_changed",

  // ─ deal_closed_won ─────────────────────────────────────────────────────────
  deal_closed_won:            "deal_closed_won",
  deal_won:                   "deal_closed_won",
  closed_won:                 "deal_closed_won",
  won:                        "deal_closed_won",
  deal_closed:                "deal_closed_won",
  opportunity_won:            "deal_closed_won",
  sale_closed:                "deal_closed_won",

  // ─ deal_closed_lost ────────────────────────────────────────────────────────
  deal_closed_lost:           "deal_closed_lost",
  deal_lost:                  "deal_closed_lost",
  closed_lost:                "deal_closed_lost",
  lost:                       "deal_closed_lost",
  opportunity_lost:           "deal_closed_lost",

  // ─ trial_started ───────────────────────────────────────────────────────────
  trial_started:              "trial_started",
  trial_created:              "trial_started",
  free_trial:                 "trial_started",
  trial_signup:               "trial_started",
  trialing:                   "trial_started",

  // ─ subscription_created ────────────────────────────────────────────────────
  subscription_created:       "subscription_created",
  subscription_started:       "subscription_created",
  subscribed:                 "subscription_created",
  new_subscription:           "subscription_created",
  customer_subscribed:        "subscription_created",
  payment_success:            "subscription_created",
  checkout_completed:         "subscription_created",
  purchase:                   "subscription_created",

  // ─ subscription_upgraded ───────────────────────────────────────────────────
  subscription_upgraded:      "subscription_upgraded",
  plan_upgraded:              "subscription_upgraded",
  subscription_updated:       "subscription_upgraded",
  upgraded:                   "subscription_upgraded",
  upsell:                     "subscription_upgraded",
  expansion:                  "subscription_upgraded",

  // ─ subscription_cancelled ──────────────────────────────────────────────────
  subscription_cancelled:     "subscription_cancelled",
  subscription_canceled:      "subscription_cancelled",
  cancelled:                  "subscription_cancelled",
  churned:                    "subscription_cancelled",
  subscription_ended:         "subscription_cancelled",
  customer_churned:           "subscription_cancelled",
  unsubscribed:               "subscription_cancelled",

  // ─ payment_received ────────────────────────────────────────────────────────
  payment_received:           "payment_received",
  payment_succeeded:          "payment_received",
  invoice_paid:               "payment_received",
  charge_succeeded:           "payment_received",
  revenue:                    "payment_received",

  // ─ payment_failed ──────────────────────────────────────────────────────────
  payment_failed:             "payment_failed",
  charge_failed:              "payment_failed",
  invoice_payment_failed:     "payment_failed",
  payment_declined:           "payment_failed",

  // ─ voicemail_left ──────────────────────────────────────────────────────────
  voicemail_left:             "voicemail_left",
  voicemail:                  "voicemail_left",
  voicemail_dropped:          "voicemail_left",
};

// ── Keyword-based fallback rules ──────────────────────────────────────────────
// Applied when alias lookup fails. Each entry: [keyword, canonical].
// Ordered from most specific to most general.

const KEYWORD_RULES: [string, CanonicalEventKey][] = [
  // High-value positive signals first
  ["deal won",          "deal_closed_won"],
  ["closed won",        "deal_closed_won"],
  ["closed_won",        "deal_closed_won"],
  ["deal lost",         "deal_closed_lost"],
  ["closed lost",       "deal_closed_lost"],
  ["closed_lost",       "deal_closed_lost"],
  ["meeting booked",    "meeting_booked"],
  ["meeting scheduled", "meeting_booked"],
  ["demo booked",       "meeting_booked"],
  ["demo scheduled",    "meeting_booked"],
  ["meeting held",      "meeting_completed"],
  ["meeting completed", "meeting_completed"],
  ["reply",             "reply_received"],
  ["replied",           "reply_received"],
  ["response",          "reply_received"],
  ["inbound",           "reply_received"],
  ["connection accept", "connection_accepted"],
  ["invite accept",     "connection_accepted"],
  ["connection sent",   "connection_sent"],
  ["invite sent",       "connection_sent"],
  ["linkedin",          "linkedin_sent"],
  ["call answer",       "call_answered"],
  ["call complet",      "call_answered"],
  ["call ended",        "call_answered"],
  ["call placed",       "call_placed"],
  ["voicemail",         "voicemail_left"],
  ["email open",        "email_opened"],
  ["opened",            "email_opened"],
  ["email click",       "email_clicked"],
  ["clicked",           "email_clicked"],
  ["email sent",        "email_sent"],
  ["email deliver",     "email_sent"],
  ["sms",               "sms_sent"],
  ["enrich",            "contact_enriched"],
  ["enroll",            "sequence_enrolled"],
  ["sequence",          "sequence_enrolled"],
  ["campaign",          "sequence_enrolled"],
  ["deal creat",        "deal_created"],
  ["opportunity creat", "deal_created"],
  ["deal stage",        "deal_stage_changed"],
  ["stage change",      "deal_stage_changed"],
  ["subscription",      "subscription_created"],
  ["subscrib",          "subscription_created"],
  ["payment",           "payment_received"],
  ["invoice paid",      "payment_received"],
  ["trial",             "trial_started"],
  ["churn",             "subscription_cancelled"],
  ["cancel",            "subscription_cancelled"],
  ["contact creat",     "contact_created"],
  ["lead creat",        "contact_sourced"],
  ["sourced",           "contact_sourced"],
  ["prospect",          "contact_sourced"],
  ["book",              "meeting_booked"],
  ["sent",              "email_sent"],
];

// ── Normalisation function ────────────────────────────────────────────────────

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Map any raw event string to a canonical iqpipe event key.
 *
 * Resolution order:
 *   1. Already a canonical key → return as-is
 *   2. Alias map exact match
 *   3. Keyword rules (substring match on slug or original string)
 *   4. Unknown → return the slug as-is (stored verbatim, shown as raw event)
 *
 * @param raw       Raw event string (any casing, any separator)
 * @param context   Optional extra context string (e.g., node name) for keywords
 */
export function normalizeEventType(raw: string, context?: string): string {
  if (!raw) return "event";

  const slug = toSlug(raw);

  // 1. Already canonical
  if (slug in CANONICAL_EVENTS) return slug;

  // 2. Alias exact match
  if (ALIASES[slug]) return ALIASES[slug];

  // 3. Keyword rules against slug + optional context
  const haystack = context ? `${slug} ${toSlug(context)}` : slug;
  for (const [kw, canonical] of KEYWORD_RULES) {
    if (haystack.includes(kw.replace(/\s+/g, "_")) || haystack.includes(kw)) {
      return canonical;
    }
  }

  // 4. Unknown — keep the slug so it's still human-readable
  return slug || "event";
}

/**
 * Return canonical metadata for a key, or a generic fallback.
 */
export function getCanonicalMeta(key: string): CanonicalEventMeta {
  const meta = CANONICAL_EVENTS[key as CanonicalEventKey];
  if (meta) return meta;
  return { label: key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), category: "outreach", funnelPos: 50 };
}

/**
 * True if the key is a known canonical event.
 */
export function isCanonical(key: string): key is CanonicalEventKey {
  return key in CANONICAL_EVENTS;
}
