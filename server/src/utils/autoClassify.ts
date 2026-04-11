/**
 * autoClassify.ts
 *
 * Infers source tool and canonical event type from a raw webhook payload.
 *
 * Called by the n8n and Make.com push handlers when the user has NOT
 * explicitly set an "event" field — i.e. they just passed their workflow's
 * raw output through an HTTP Request node.
 *
 * Design principle: the user should never have to describe their workflow
 * to iqpipe. iqpipe should recognise what happened from the data itself.
 */

import { normalizeEventType } from "./eventTaxonomy";

// ─── Result shape ─────────────────────────────────────────────────────────────

export interface ClassifiedPayload {
  eventType:   string;           // canonical iqpipe event key
  sourceTool:  string;           // e.g. "apollo", "heyreach", "lemlist"
  confidence:  "high" | "low";  // high = field-signature match, low = heuristic
}

// ─── Source tool signatures ───────────────────────────────────────────────────
// Each entry: { tool, fields (subset of payload keys required), event }
// Checked in order — first match wins.

const TOOL_SIGNATURES: Array<{
  tool:   string;
  fields: string[];       // keys that must ALL exist in the payload (case-insensitive check)
  event:  string;         // canonical event this tool+shape implies
}> = [
  // ── Apollo ──
  { tool: "apollo",       fields: ["apollo_id"],                          event: "contact_enriched" },
  { tool: "apollo",       fields: ["organization_name", "headline"],      event: "contact_enriched" },
  { tool: "apollo",       fields: ["organization_name", "employment_history"], event: "contact_enriched" },

  // ── Clay ──
  { tool: "clay",         fields: ["clay_run_id"],                        event: "contact_enriched" },
  { tool: "clay",         fields: ["claygent"],                           event: "contact_enriched" },
  { tool: "clay",         fields: ["clay_table_id"],                      event: "contact_sourced"  },

  // ── HeyReach ──
  { tool: "heyreach",     fields: ["heyreach_lead_id"],                   event: "linkedin_sent"    },
  { tool: "heyreach",     fields: ["campaignId", "linkedinUrl"],          event: "linkedin_sent"    },
  { tool: "heyreach",     fields: ["lead", "campaignId"],                 event: "linkedin_sent"    },

  // ── Expandi ──
  { tool: "expandi",      fields: ["expandi_campaign_id"],                event: "linkedin_sent"    },
  { tool: "expandi",      fields: ["campaign_id", "profile_url"],         event: "linkedin_sent"    },

  // ── Dripify ──
  { tool: "dripify",      fields: ["dripify_campaign_id"],                event: "linkedin_sent"    },
  { tool: "dripify",      fields: ["sequence_id", "linkedin_url"],        event: "linkedin_sent"    },

  // ── Waalaxy ──
  { tool: "waalaxy",      fields: ["waalaxy_campaign_id"],                event: "linkedin_sent"    },
  { tool: "waalaxy",      fields: ["prospect_id", "linkedin_url"],        event: "linkedin_sent"    },

  // ── Lemlist ──
  { tool: "lemlist",      fields: ["lemlist_id"],                         event: "email_sent"       },
  { tool: "lemlist",      fields: ["campaignId", "lemlistId"],            event: "email_sent"       },
  { tool: "lemlist",      fields: ["campaignId", "sequenceStep"],         event: "email_sent"       },

  // ── Instantly ──
  { tool: "instantly",    fields: ["instantly_lead_id"],                  event: "email_sent"       },
  { tool: "instantly",    fields: ["campaign_id", "instantly_id"],        event: "email_sent"       },
  { tool: "instantly",    fields: ["lead_id", "campaign_name"],           event: "email_sent"       },

  // ── Smartlead ──
  { tool: "smartlead",    fields: ["smartlead_id"],                       event: "email_sent"       },
  { tool: "smartlead",    fields: ["smartlead_campaign_id"],              event: "email_sent"       },

  // ── Mailshake ──
  { tool: "mailshake",    fields: ["mailshake_campaign_id"],              event: "email_sent"       },

  // ── Outreach.io ──
  { tool: "outreach",     fields: ["outreach_id", "prospect_id"],        event: "email_sent"       },
  { tool: "outreach",     fields: ["outreach_sequence_id"],               event: "sequence_enrolled"},

  // ── Salesloft ──
  { tool: "salesloft",    fields: ["salesloft_id"],                       event: "email_sent"       },
  { tool: "salesloft",    fields: ["salesloft_person_id"],                event: "contact_created"  },

  // ── Reply.io ──
  { tool: "replyio",      fields: ["reply_campaign_id"],                  event: "email_sent"       },
  { tool: "replyio",      fields: ["replyio_id"],                         event: "email_sent"       },

  // ── HubSpot ──
  { tool: "hubspot",      fields: ["hs_object_id", "dealstage"],          event: "deal_stage_changed" },
  { tool: "hubspot",      fields: ["hs_object_id", "amount"],             event: "deal_created"     },
  { tool: "hubspot",      fields: ["hs_object_id", "hubspot_owner_id"],   event: "contact_created"  },
  { tool: "hubspot",      fields: ["hs_object_id"],                       event: "contact_updated"  },

  // ── Salesforce ──
  { tool: "salesforce",   fields: ["sfdc_id", "StageName"],               event: "deal_stage_changed" },
  { tool: "salesforce",   fields: ["SalesforceId"],                       event: "contact_updated"  },
  { tool: "salesforce",   fields: ["sfdc_id"],                            event: "contact_updated"  },

  // ── Pipedrive ──
  { tool: "pipedrive",    fields: ["deal_id", "stage_id"],                event: "deal_stage_changed" },
  { tool: "pipedrive",    fields: ["person_id", "org_id"],                event: "contact_created"  },

  // ── Calendly ──
  { tool: "calendly",     fields: ["event_type", "invitee"],              event: "meeting_booked"   },
  { tool: "calendly",     fields: ["invitee_uuid"],                       event: "meeting_booked"   },
  { tool: "calendly",     fields: ["scheduled_event"],                    event: "meeting_booked"   },

  // ── Chili Piper ──
  { tool: "chilipiper",   fields: ["chili_piper_event_id"],               event: "meeting_booked"   },

  // ── Typeform ──
  { tool: "typeform",     fields: ["form_id", "token", "answers"],        event: "form_submitted"   },
  { tool: "typeform",     fields: ["form_response"],                      event: "form_submitted"   },

  // ── Aircall ──
  { tool: "aircall",      fields: ["aircall_call_id"],                    event: "call_placed"      },
  { tool: "aircall",      fields: ["call_uuid", "direction"],             event: "call_placed"      },

  // ── Kixie ──
  { tool: "kixie",        fields: ["kixie_call_id"],                      event: "call_placed"      },
  { tool: "kixie",        fields: ["call_id", "disposition"],             event: "call_answered"    },

  // ── Stripe (user's own) ──
  { tool: "stripe",       fields: ["customer", "subscription", "plan"],   event: "subscription_created" },
  { tool: "stripe",       fields: ["customer", "invoice"],                event: "payment_received" },
  { tool: "stripe",       fields: ["charge", "customer"],                 event: "payment_received" },

  // ── ZoomInfo ──
  { tool: "zoominfo",     fields: ["zi_contact_id"],                      event: "contact_enriched" },
  { tool: "zoominfo",     fields: ["zoominfo_id", "company_name"],        event: "contact_enriched" },

  // ── Clearbit ──
  { tool: "clearbit",     fields: ["clearbit_id"],                        event: "contact_enriched" },
  { tool: "clearbit",     fields: ["person", "company"],                  event: "contact_enriched" },

  // ── Lusha ──
  { tool: "lusha",        fields: ["lusha_id"],                           event: "contact_enriched" },

  // ── Hunter.io ──
  { tool: "hunter",       fields: ["hunter_id", "email_count"],           event: "contact_enriched" },
];

// ─── Field-shape heuristics (fallback when no tool signature matches) ─────────

interface ShapeHint {
  keys:  string[];   // payload must contain ALL of these (case-insensitive)
  event: string;
}

const SHAPE_HINTS: ShapeHint[] = [
  // Meeting / calendar
  { keys: ["invitee", "event_type"],                        event: "meeting_booked"       },
  { keys: ["meeting_url", "start_time"],                    event: "meeting_booked"       },
  { keys: ["scheduled_event", "email"],                     event: "meeting_booked"       },
  { keys: ["answers", "form_id"],                           event: "form_submitted"       },

  // Call
  { keys: ["call_duration", "direction"],                   event: "call_answered"        },
  { keys: ["call_id", "duration"],                          event: "call_answered"        },
  { keys: ["call_id", "to"],                                event: "call_placed"          },

  // LinkedIn outreach
  { keys: ["linkedin_url", "message"],                      event: "linkedin_sent"        },
  { keys: ["profileUrl", "message"],                        event: "linkedin_sent"        },
  { keys: ["linkedin_url", "connection_requested"],         event: "connection_sent"      },

  // Enrichment — has many profile-like fields
  { keys: ["employment_history", "email"],                  event: "contact_enriched"     },
  { keys: ["organization_name", "email", "title"],          event: "contact_enriched"     },
  { keys: ["headline", "email", "company"],                 event: "contact_enriched"     },

  // Deal
  { keys: ["deal_stage", "amount"],                         event: "deal_stage_changed"   },
  { keys: ["dealstage", "email"],                           event: "deal_stage_changed"   },
  { keys: ["deal_id", "value"],                             event: "deal_created"         },
  { keys: ["StageName", "Amount"],                          event: "deal_stage_changed"   },

  // Email sent
  { keys: ["subject", "to", "from"],                        event: "email_sent"           },
  { keys: ["email_body", "recipient"],                      event: "email_sent"           },
  { keys: ["campaign_id", "email", "sent_at"],              event: "email_sent"           },

  // Reply
  { keys: ["reply_text", "email"],                          event: "reply_received"       },
  { keys: ["reply_body", "sender"],                         event: "reply_received"       },

  // Payment
  { keys: ["invoice", "amount_paid"],                       event: "payment_received"     },
  { keys: ["charge_id", "amount"],                          event: "payment_received"     },

  // Sequence
  { keys: ["sequence_id", "email"],                         event: "sequence_enrolled"    },
  { keys: ["campaign_id", "email"],                         event: "email_sent"           },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flatKeys(obj: Record<string, any>): Set<string> {
  const keys = new Set<string>();
  function walk(o: any) {
    if (!o || typeof o !== "object") return;
    for (const k of Object.keys(o)) {
      keys.add(k.toLowerCase());
      walk(o[k]);
    }
  }
  walk(obj);
  return keys;
}

function hasAll(keys: Set<string>, required: string[]): boolean {
  return required.every(r => keys.has(r.toLowerCase()));
}

// Detect source tool from explicit body field (user might pass e.g. "source": "apollo")
const TOOL_NAME_ALIASES: Record<string, string> = {
  apollo:      "apollo",
  "apollo.io": "apollo",
  clay:        "clay",
  heyreach:    "heyreach",
  expandi:     "expandi",
  dripify:     "dripify",
  waalaxy:     "waalaxy",
  lemlist:     "lemlist",
  instantly:   "instantly",
  smartlead:   "smartlead",
  mailshake:   "mailshake",
  outreach:    "outreach",
  salesloft:   "salesloft",
  "reply.io":  "replyio",
  replyio:     "replyio",
  hubspot:     "hubspot",
  salesforce:  "salesforce",
  pipedrive:   "pipedrive",
  calendly:    "calendly",
  chilipiper:  "chilipiper",
  typeform:    "typeform",
  aircall:     "aircall",
  kixie:       "kixie",
  stripe:      "stripe",
  zoominfo:    "zoominfo",
  clearbit:    "clearbit",
  lusha:       "lusha",
  hunter:      "hunter",
  n8n:         "n8n",
  make:        "make",
  "make.com":  "make",
};

function resolveToolAlias(raw: string): string | null {
  const key = raw.toLowerCase().trim();
  return TOOL_NAME_ALIASES[key] ?? null;
}

// ─── Main classifier ──────────────────────────────────────────────────────────

/**
 * Given a raw push payload, return:
 *   - eventType:  canonical iqpipe event key (e.g. "contact_enriched")
 *   - sourceTool: the tool that generated the event (e.g. "apollo")
 *   - confidence: "high" if a field-signature matched, "low" if heuristic
 *
 * Falls back to ("workflow.completed", platform, "low") if nothing matches.
 * The caller (platform = "n8n" | "make") is used as final fallback tool name.
 */
export function autoClassify(
  body: Record<string, any>,
  platform: "n8n" | "make",
): ClassifiedPayload {
  const keys = flatKeys(body);

  // ── 1. Explicit source_tool in payload → tool is known, just classify event ─
  const explicitTool =
    body.source_tool || body.sourceTool || body.source || body.tool ||
    body.app || body.integration || null;

  const resolvedTool = explicitTool ? resolveToolAlias(String(explicitTool)) : null;

  // ── 2. Try tool-signature match ─────────────────────────────────────────────
  for (const sig of TOOL_SIGNATURES) {
    if (resolvedTool && sig.tool !== resolvedTool) continue; // skip if tool known but doesn't match
    if (hasAll(keys, sig.fields)) {
      const canonical = normalizeEventType(sig.event);
      return {
        eventType:  canonical,
        sourceTool: sig.tool,
        confidence: "high",
      };
    }
  }

  // ── 3. If tool was provided explicitly, try shape hints to get the event ────
  if (resolvedTool) {
    for (const hint of SHAPE_HINTS) {
      if (hasAll(keys, hint.keys)) {
        return {
          eventType:  normalizeEventType(hint.event),
          sourceTool: resolvedTool,
          confidence: "high",
        };
      }
    }
    // Tool known, event unknown — use a sensible per-tool default
    const TOOL_DEFAULTS: Record<string, string> = {
      apollo:     "contact_enriched",
      clay:       "contact_enriched",
      heyreach:   "linkedin_sent",
      expandi:    "linkedin_sent",
      dripify:    "linkedin_sent",
      waalaxy:    "linkedin_sent",
      lemlist:    "email_sent",
      instantly:  "email_sent",
      smartlead:  "email_sent",
      mailshake:  "email_sent",
      outreach:   "email_sent",
      salesloft:  "email_sent",
      replyio:    "email_sent",
      hubspot:    "contact_updated",
      salesforce: "contact_updated",
      pipedrive:  "contact_updated",
      calendly:   "meeting_booked",
      aircall:    "call_placed",
      kixie:      "call_placed",
      typeform:   "form_submitted",
      stripe:     "payment_received",
      clearbit:   "contact_enriched",
      zoominfo:   "contact_enriched",
      lusha:      "contact_enriched",
      hunter:     "contact_enriched",
    };
    return {
      eventType:  TOOL_DEFAULTS[resolvedTool] ?? "workflow.completed",
      sourceTool: resolvedTool,
      confidence: "high",
    };
  }

  // ── 4. No tool info — try shape hints alone ─────────────────────────────────
  for (const hint of SHAPE_HINTS) {
    if (hasAll(keys, hint.keys)) {
      return {
        eventType:  normalizeEventType(hint.event),
        sourceTool: platform,
        confidence: "low",
      };
    }
  }

  // ── 5. Nothing matched — workflow completed, platform as tool ───────────────
  return {
    eventType:  "workflow.completed",
    sourceTool: platform,
    confidence: "low",
  };
}
