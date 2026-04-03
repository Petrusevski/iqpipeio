/**
 * kbSeed.ts — Knowledge base seed content
 *
 * Call ensureKbSeeded() once at server startup. It runs a COUNT query first;
 * if articles already exist it exits immediately (idempotent).
 *
 * Articles are written in GitHub-flavored Markdown. Summaries are single
 * sentences (shown in list views / quick answers). Bodies are full deep-dives.
 */

import { prisma } from "../db";

// ─── Article data ─────────────────────────────────────────────────────────────

interface ArticleSeed {
  slug:         string;
  title:        string;
  summary:      string;
  body:         string;
  category:     string;
  tags:         string[];
  useCase:      string[];
  platform:     string[];
  difficulty:   string;
  featured:     boolean;
  relatedSlugs: string[];
}

const ARTICLES: ArticleSeed[] = [

  // ── Troubleshooting ─────────────────────────────────────────────────────────

  {
    slug:       "duplicate-leads",
    title:      "Why events create duplicate leads — and how to fix it",
    summary:    "Duplicates happen when the same person arrives via different identity fields across tools; fixing the field mappings for each source resolves them.",
    category:   "troubleshooting",
    difficulty: "beginner",
    featured:   true,
    tags:       ["duplicates","identity","field-mapping","deduplication"],
    useCase:    ["lead_enrichment","data_cleaning"],
    platform:   ["any"],
    relatedSlugs: ["identity-resolution-tips","field-detection-explained","live-feed-troubleshoot"],
    body: `## Why duplicates happen

IQPipe links events to existing leads by matching on **email hash**, **LinkedIn URL hash**, or **phone hash** — in that order of confidence. A new lead is created only when none of those identifiers match an existing record.

Duplicates appear when:

- **Different tools send different fields.** Tool A sends \`email\`, tool B sends only \`linkedin_url\`. If the same person is processed by both tools before one has both fields, two records are created.
- **Field mapping is wrong.** Auto-detection may have mapped a field (e.g. \`contact_email\`) to the wrong canonical field, so the email never reaches the identity resolver.
- **Inconsistent formatting.** LinkedIn URLs especially vary: \`linkedin.com/in/alice\`, \`www.linkedin.com/in/alice/\`, \`https://linkedin.com/in/alice\`. IQPipe normalises these, but custom URL formats may slip through.

## How to diagnose

1. Go to **Settings → Field Mappings**, filter by the source tool, and check that \`contact.email\` is mapped to an actual email field — not a name or ID field.
2. Use the **Field Mappings → Preview** endpoint: paste a raw webhook payload from the problematic tool and check the \`resolvedContact\` output. If \`email\` is empty, the mapping is broken.
3. Check the **Live Feed** for the duplicate lead. Open both records and compare which tools contributed events. The missing overlap tells you which source isn't sending the shared identifier.

## How to fix it

**Step 1 — Correct the field mapping.** In Field Mappings, find the wrong mapping and use the Override button to point it at \`contact.email\` (or whichever identifier is missing).

**Step 2 — Ensure the upstream tool sends email.** In your n8n or Make.com workflow, verify the HTTP Request node or IQPipe module is passing \`contact.email\` in the payload. If the tool doesn't have the email, add an enrichment step (e.g. a Clay lookup) before the IQPipe node.

**Step 3 — Let stitching resolve the rest.** Once the corrected mappings are live, future events will match correctly. For existing duplicates, the next event from either record that includes both identifiers will stitch the two records together automatically.

## Prevention

The most resilient setup passes **email + LinkedIn URL** on every event, even if one is already known. Redundant identifiers act as a safety net when one field changes format.`,
  },

  {
    slug:       "live-feed-troubleshoot",
    title:      "Events not appearing in Live Feed",
    summary:    "If events are missing from Live Feed, check authentication, quota, and field mapping — most issues are caught within the first three steps.",
    category:   "troubleshooting",
    difficulty: "beginner",
    featured:   true,
    tags:       ["live-feed","debugging","quota","authentication","webhook"],
    useCase:    ["debugging"],
    platform:   ["n8n","make","any"],
    relatedSlugs: ["duplicate-leads","n8n-quickstart","make-quickstart"],
    body: `## Quick checklist

Work through these in order — most issues are resolved by step 3.

### 1. Check authentication
- **API key auth:** Confirm the \`X-API-Key\` header in your n8n/Make node matches the key in **Settings → API**.
- **JWT auth:** If using a Bearer token, check it hasn't expired (tokens expire after 10 minutes of inactivity).
- **Test it:** Send a \`GET /api/workspaces/primary\` request with your credentials. A 401 means the key is wrong; a 200 confirms auth is working.

### 2. Check quota
Open **Settings → Billing**. If your monthly event quota is exhausted, new events are dropped silently (the sender receives 200 to prevent retries). Upgrade your plan or wait for the next billing cycle reset.

If you're hitting the per-minute rate limit (60 req/min on trial/free), slow your event ingestion or upgrade to a plan with a higher limit.

### 3. Check field mapping
Every event needs at least one identity field: \`contact.email\`, \`contact.linkedin\`, \`contact.phone\`, or \`contact.anonymousId\`. Events with no identity field are rejected with a 400 error.

Use **Field Mappings → Preview** to paste your payload and confirm \`resolvedContact\` contains at least one identifier.

### 4. Check consent
The \`/api/events\` endpoint requires a \`consent.basis\` field. Missing or invalid consent basis returns 400. Valid values: \`legitimate_interest\`, \`consent\`, \`contract\`, \`vital_interests\`, \`public_task\`, \`legal_obligation\`.

### 5. Check the webhook URL
For \`/api/webhooks/:provider\` endpoints, the URL must include \`?workspaceId=YOUR_WORKSPACE_ID\`. Without it, the event is rejected.

### 6. Look at the n8n / Make execution log
Check for non-200 responses in your workflow execution history. A 400 means invalid payload; a 429 means rate-limited; a 500 means a server error (contact support with the request ID).

### Still missing?
Events processed through the n8n queue processor (via the n8n execution sync) can have up to a 30-second delay. Wait 60 seconds and refresh Live Feed before investigating further.`,
  },

  // ── Concepts ────────────────────────────────────────────────────────────────

  {
    slug:       "field-detection-explained",
    title:      "How automatic field detection works",
    summary:    "Field detection scans the full webhook payload using regex patterns and field-name hints to find email, phone, LinkedIn URL, and other contact fields even when they are named differently than expected.",
    category:   "concept",
    difficulty: "intermediate",
    featured:   false,
    tags:       ["field-detection","schema","mapping","confidence"],
    useCase:    ["data_cleaning","lead_enrichment"],
    platform:   ["any"],
    relatedSlugs: ["schema-drift-recovery","duplicate-leads","identity-resolution-tips"],
    body: `## The problem it solves

Different tools name the same field differently. Clay might send \`person.email\`, Instantly sends \`contact_email\`, and a custom webhook sends \`data.emailAddress\`. Without automatic detection, you'd need to manually map every field from every tool.

Field detection scans the entire payload and identifies fields by their **value** and **name** — without requiring a predefined schema.

## Three detection signals

### 1. Value pattern (highest reliability)
The value itself is tested against known patterns:
- Email regex: \`user@domain.tld\` → \`contact.email\` (confidence 0.92)
- LinkedIn URL: \`linkedin.com/in/handle\` → \`contact.linkedin\` (confidence 0.95)
- Phone number: 7–15 digits with valid formatting → \`contact.phone\` (confidence 0.75)

### 2. Field name corroboration
The leaf key of the dot-path is normalised (lowercase, alphanumeric only) and checked against 330+ known aliases:
- \`emailaddress\`, \`email_addr\`, \`mail\` → \`contact.email\` (confidence 0.82)
- \`firstname\`, \`fname\`, \`given_name\` → \`contact.firstName\` (confidence 0.82)
- Partial matches get lower confidence (0.65)

### 3. Combined signal boost
When both value and field name agree on the same canonical field, confidence is boosted by 0.08 (capped at 0.99). A value that looks like an email AND sits in a field named \`email_address\` reaches ~1.0 confidence.

## The confidence threshold

Only detections above **0.70** are applied. Below that, the detection is logged in the \`skippedDetections\` report but not used. This prevents false positives from ambiguous fields (e.g. a numeric ID that happens to be 10 digits).

## Learning and overrides

Every detection above threshold is persisted in the **FieldMapping** table for your workspace + source combination. On the next event from the same source, stored mappings are applied first (no threshold check — stored mappings are always trusted).

If a mapping is wrong, open **Settings → Field Mappings**, find the mapping, and click Override to correct it. The override is stored with \`confidence: 1.0\` and \`detectionMethod: manual_override\` — it will always win over auto-detection.

## The preview tool

Use **Field Mappings → Preview** (POST \`/api/field-mappings/preview\`) to test detection on any payload before going live. Pass \`"verbose": true\` to get every raw detection candidate, not just the applied ones.`,
  },

  // ── Guides ──────────────────────────────────────────────────────────────────

  {
    slug:       "n8n-quickstart",
    title:      "Connect n8n to IQPipe in 5 minutes",
    summary:    "Add an HTTP Request node (or the IQPipe node if available) to any n8n workflow to start tracking lead events in real time.",
    category:   "guide",
    difficulty: "beginner",
    featured:   true,
    tags:       ["n8n","setup","webhook","quickstart"],
    useCase:    ["gtm_workflow","lead_enrichment"],
    platform:   ["n8n"],
    relatedSlugs: ["event-naming-standards","duplicate-leads","n8n-execution-sync"],
    body: `## Prerequisites
- An IQPipe account with at least Trial plan
- An n8n instance (cloud or self-hosted)
- Your IQPipe API key (Settings → API)

## Option A — HTTP Request node (works everywhere)

This is the most flexible approach and works on any n8n version.

### Step 1: Add the HTTP Request node
After the step that produces contact data, add an **HTTP Request** node.

Configure it:
- **Method:** POST
- **URL:** \`https://your-iqpipe-url.vercel.app/api/events\`
- **Authentication:** Header Auth → Name: \`X-API-Key\`, Value: your API key
- **Body:** JSON

### Step 2: Build the payload
Use n8n expressions to map your data:
\`\`\`json
{
  "contact": {
    "email":     "{{ $json.email }}",
    "linkedin":  "{{ $json.linkedin_url }}",
    "firstName": "{{ $json.first_name }}",
    "lastName":  "{{ $json.last_name }}",
    "company":   "{{ $json.company }}"
  },
  "event":  "reply_received",
  "source": "my-outreach-sequence",
  "consent": { "basis": "legitimate_interest" }
}
\`\`\`

### Step 3: Test
Run the workflow manually with a test contact. Check **Live Feed** — you should see the event within a few seconds.

## Option B — n8n Execution Sync (recommended for existing workflows)

If you connect your n8n account under **Settings → Integrations → n8n**, IQPipe can sync execution data from your existing workflows without modifying them.

1. Go to **Settings → Integrations** and click **Connect n8n**.
2. Enter your n8n base URL and API key.
3. IQPipe will import all your workflows and begin syncing execution results.
4. For each workflow, open **Workflow Mirrors** to map the apps used and configure which events to track.

## Event naming

Use IQPipe's canonical event names for the best analytics experience: \`email_sent\`, \`reply_received\`, \`meeting_booked\`, \`deal_closed_won\`. Custom names work too but won't appear in funnel reports automatically.

See the [Event naming standards](#event-naming-standards) guide for the full list.`,
  },

  {
    slug:       "make-quickstart",
    title:      "Connect Make.com to IQPipe in 5 minutes",
    summary:    "Add an HTTP module to any Make.com scenario to forward lead events to IQPipe, or connect your Make account for automatic scenario sync.",
    category:   "guide",
    difficulty: "beginner",
    featured:   true,
    tags:       ["make","make.com","setup","webhook","quickstart"],
    useCase:    ["gtm_workflow","lead_enrichment"],
    platform:   ["make"],
    relatedSlugs: ["event-naming-standards","duplicate-leads","workflow-mirrors-guide"],
    body: `## Prerequisites
- An IQPipe account with at least Trial plan
- A Make.com account
- Your IQPipe API key (Settings → API)

## Option A — HTTP module (works everywhere)

### Step 1: Add an HTTP → Make a request module
At the point in your scenario where you have contact data, add **HTTP → Make a request**.

Configure it:
- **URL:** \`https://your-iqpipe-url.vercel.app/api/events\`
- **Method:** POST
- **Headers:** \`X-API-Key: YOUR_API_KEY\` and \`Content-Type: application/json\`
- **Body type:** Raw / JSON

### Step 2: Build the JSON body
\`\`\`json
{
  "contact": {
    "email":     "{{contact.email}}",
    "linkedin":  "{{contact.linkedIn}}",
    "firstName": "{{contact.firstName}}",
    "lastName":  "{{contact.lastName}}",
    "company":   "{{contact.company}}"
  },
  "event":  "reply_received",
  "source": "make-outreach",
  "consent": { "basis": "legitimate_interest" }
}
\`\`\`

Map values from earlier modules using Make's data picker.

### Step 3: Test
Run the scenario once. Check **Live Feed** — the event should appear within seconds. If it doesn't, check the module output for a non-200 response code and see the [Live Feed troubleshooting guide](#live-feed-troubleshoot).

## Option B — Make Execution Sync (recommended for existing scenarios)

1. Go to **Settings → Integrations** and click **Connect Make.com**.
2. Enter your Make API key and region.
3. IQPipe imports all scenarios and starts syncing execution data.
4. Use **Workflow Mirrors** to map which apps each scenario uses and what to track.

## Handling multi-step scenarios

If your scenario has multiple steps (e.g. enrich → send email → update CRM), send a separate IQPipe event for each meaningful action. This gives you full funnel visibility. Use the same \`contact.email\` across all events so they all stitch to the same lead.

## Notes on array outputs

Make modules often produce arrays (e.g. multiple contacts from a Clay lookup). Use an **Iterator** module before the IQPipe HTTP module to send one event per contact rather than one event with an array payload.`,
  },

  {
    slug:       "schema-drift-recovery",
    title:      "Recovering from schema drift without losing events",
    summary:    "When a tool changes its webhook payload structure, use the Field Mappings preview tool to detect the new shape, apply an override, and backfill any events that arrived during the drift window.",
    category:   "guide",
    difficulty: "intermediate",
    featured:   true,
    tags:       ["schema-drift","field-mapping","resilience","webhooks"],
    useCase:    ["data_cleaning","debugging"],
    platform:   ["n8n","make","any"],
    relatedSlugs: ["field-detection-explained","duplicate-leads","live-feed-troubleshoot"],
    body: `## What schema drift is

Schema drift happens when a tool you're integrated with changes the structure or names of fields in their webhook payload. For example:

- Clay changes \`person.email\` → \`contact.email_address\`
- Instantly renames \`lead_status\` → \`contactStatus\`
- A vendor moves fields from the top level into a nested \`data\` object

When this happens, IQPipe's field mappings for that source stop resolving the affected fields. Identity resolution degrades (no email match = new duplicate leads), and funnel events may be miscategorised.

## Detecting drift

You'll typically notice drift through one of:
1. **Sudden spike in new leads** — duplicates being created because email is no longer matching
2. **Drop in event volume** — events arriving but being silently rejected due to missing identity fields
3. **Notification** — some vendors (HubSpot, Salesforce) send schema change notices; check your vendor's changelog

**Confirm it with the Preview tool:**
1. Get a sample payload from the tool after the change (check the tool's webhook history or trigger a test)
2. Go to **Settings → Field Mappings → Preview**
3. Paste the payload and set \`source\` to your tool slug
4. Check \`resolvedContact\` — if \`email\` is missing, drift has broken the mapping

## Fixing the mapping

1. In **Settings → Field Mappings**, filter by source and find the affected mapping (e.g. the old \`person.email\` entry)
2. Click **Override** and point it at the new field path (e.g. \`contact.email_address\`)
3. The override is applied immediately to all future events

Alternatively, if the field name is new and not in your learned mappings yet, the auto-detector will pick it up from the next event (value pattern detection catches email-format values regardless of field name). The Preview tool shows you whether this will happen.

## Backfilling missed events

Events that arrived during the drift window without an email match created duplicate leads. To recover:

1. Check your tool's webhook delivery log for the time window (most tools retain 7–30 days)
2. Re-deliver (or re-trigger) those events — with the corrected mapping in place, they'll now match the existing leads
3. IQPipe's dedup logic will prevent double-counting: events with the same \`externalId\` (execution ID, event ID) are idempotent

## Prevention

Enable **email + LinkedIn** on every event payload. Even if only one is populated, having both fields mapped means drift in one still leaves the other as a fallback identity signal.`,
  },

  {
    slug:       "workflow-mirrors-guide",
    title:      "Workflow mirrors: connect apps to automations",
    summary:    "A workflow mirror links a specific n8n workflow or Make.com scenario to the apps it uses, enabling IQPipe to track outcomes at the automation level rather than just the event level.",
    category:   "guide",
    difficulty: "intermediate",
    featured:   false,
    tags:       ["workflow-mirror","n8n","make","attribution","apps"],
    useCase:    ["gtm_workflow","attribution"],
    platform:   ["n8n","make"],
    relatedSlugs: ["n8n-quickstart","make-quickstart","multi-source-attribution"],
    body: `## Why mirrors exist

When IQPipe receives an event from n8n, it knows *something happened* — but not which workflow caused it or which business outcome followed. Workflow mirrors solve this by explicitly linking:

- An automation (n8n workflow or Make scenario)
- The apps it interacts with (Clay, Instantly, HubSpot, etc.)
- A correlation key that ties execution data to business outcomes

This enables per-automation attribution: "Workflow A generated 14 replies; 3 converted to meetings; 1 became a closed deal."

## Setting up a mirror

1. Go to **Workflow Mirrors** in the sidebar.
2. Find the workflow or scenario you want to mirror. If it's not listed, sync your integration under **Settings → Integrations**.
3. Click the workflow card to open the mirror config.
4. Under **Apps Used**, verify the detected apps are correct. Add any that are missing.
5. Set a **Correlation Key** — a stable identifier that will appear in events from this workflow (e.g. the workflow ID, or a tag you add to your HTTP payload via \`workflowId\`).
6. Save.

## The correlation key

The correlation key is how IQPipe ties an inbound event to a specific mirror. Pass it in your event payload:

\`\`\`json
{
  "workflowId": "wf_abc123",
  ...
}
\`\`\`

For n8n execution sync, the workflow ID is extracted automatically — no code change required.

## App connection status

Each app in the mirror has a connection status badge:
- **Connected (green):** The app has sent events recently and they're being attributed to this mirror
- **Warning (amber):** The app is listed but hasn't sent events via this workflow recently
- **Not configured:** No app webhook is set up for this app

Connected apps produce the richest attribution data. If an app is not sending events, check its webhook configuration or add an IQPipe HTTP node after that app's step.

## Mirror vs. global attribution

Without a mirror, attribution uses global touchpoints for the lead (all tools across all workflows). With a mirror, attribution is scoped to the specific workflow's touchpoints. Use mirrors when you run multiple parallel sequences and want to compare them.`,
  },

  // ── Playbooks ───────────────────────────────────────────────────────────────

  {
    slug:       "identity-resolution-tips",
    title:      "Getting the most from identity resolution",
    summary:    "Pass email on every event, normalise LinkedIn URLs before sending, and use anonymousId for pre-identification flows to maximise match rates and minimise duplicate leads.",
    category:   "playbook",
    difficulty: "intermediate",
    featured:   false,
    tags:       ["identity","deduplication","email","linkedin","phone"],
    useCase:    ["lead_enrichment","data_cleaning"],
    platform:   ["any"],
    relatedSlugs: ["duplicate-leads","field-detection-explained","schema-drift-recovery"],
    body: `## Identity resolution order

IQPipe resolves identity using three signals in confidence order:

| Signal | Confidence | Notes |
|--------|-----------|-------|
| Email hash | 1.0 | Most reliable — normalised to lowercase before hashing |
| LinkedIn URL hash | 0.85 | URL normalised: protocol, www, trailing slash stripped |
| Phone hash | 0.75 | Digits only after stripping formatting |

The **highest** confidence match above 0.70 wins. If multiple signals match different leads, the highest-confidence match is used.

## Best practices

### Always send email when you have it
Email is the most portable identifier across tools. Even if your tool natively identifies by phone or LinkedIn, always include email if it's available in the record.

### Normalise LinkedIn URLs upstream
If your tool sends raw LinkedIn URLs, normalise them before sending to IQPipe:
- Strip \`https://\`, \`http://\`, and \`www.\`
- Remove trailing slashes
- Result: \`linkedin.com/in/alice-example\`

IQPipe normalises URLs internally, but consistent upstream formatting prevents edge cases.

### Phone numbers: international format
Always send phone numbers in E.164 international format (\`+12025550100\`). Local formats are supported but matching is less reliable when the same number appears with different country codes across tools.

### Using anonymousId for web visitors
For website tracking or product usage before you have email, use \`anonymousId\` (a session ID or visitor ID from your analytics tool). When the user provides their email (form submit, sign-up), send a new event with both \`anonymousId\` and \`email\` — IQPipe will stitch the anonymous history to the identified lead.

### Multi-tool sequences
When a lead goes through multiple tools (Clay enrichment → Instantly email → HubSpot CRM), ensure each tool's event carries the same email address. If one tool only has LinkedIn URL, add an enrichment step to resolve the email before sending to IQPipe.

## Diagnosing resolution failures

If resolution is failing for a specific lead:
1. Check the raw payload for the event (use webhook delivery logs in your tool)
2. Verify the identity field is present and not empty
3. Check Field Mappings to confirm the field is mapped to the correct canonical field
4. Look for formatting inconsistencies (encoded characters, extra spaces)`,
  },

  {
    slug:       "multi-source-attribution",
    title:      "Multi-source attribution: tracking leads across tools",
    summary:    "Configure all tools in your GTM stack to send events with a shared email identifier, and IQPipe will automatically build a cross-tool attribution chain showing which combination of tools and touchpoints drove each outcome.",
    category:   "playbook",
    difficulty: "advanced",
    featured:   true,
    tags:       ["attribution","multi-source","gtm","funnel","outcomes"],
    useCase:    ["attribution","gtm_workflow"],
    platform:   ["n8n","make","any"],
    relatedSlugs: ["workflow-mirrors-guide","identity-resolution-tips","full-gtm-stack"],
    body: `## How attribution works

Every touchpoint IQPipe records is linked to a lead. When an **outcome event** fires (reply, meeting booked, deal won, payment received), IQPipe looks back at all prior touchpoints for that lead and builds an attribution chain:

- **First touch:** the earliest meaningful interaction
- **Last touch:** the most recent interaction before the outcome
- **All attributed tools:** every tool that contributed a touchpoint

This happens automatically as long as all your tools are sending events with the same identity field (email).

## Setting up multi-source tracking

### Step 1: Map all tools in your stack
Go through each tool in your sequence and verify it's sending events to IQPipe. For n8n/Make, check that each workflow step that represents a real interaction (send email, LinkedIn message, call placed) fires a corresponding event.

Common tools to cover:
- **Prospecting/enrichment:** Clay, ZoomInfo, Apollo → \`contact_sourced\`, \`contact_enriched\`
- **Outreach:** Instantly, Smartlead, Lemlist → \`email_sent\`, \`reply_received\`
- **LinkedIn:** HeyReach, Expandi, Dripify → \`connection_sent\`, \`connection_accepted\`, \`linkedin_sent\`
- **CRM:** HubSpot, Salesforce → \`deal_created\`, \`deal_stage_changed\`, \`deal_closed_won\`

### Step 2: Use canonical event names
Attribution quality depends on IQPipe recognising which events are meaningful. Use canonical event names so the system knows what's an outreach event vs. an outcome event. See [Event naming standards](#event-naming-standards).

### Step 3: Mark outcome events
Outcome events trigger attribution. Ensure your CRM or closing tool sends one of the recognised outcome events:
\`reply_received\`, \`meeting_booked\`, \`deal_closed_won\`, \`payment_received\`, \`subscription_created\`.

### Step 4: Verify in reports
Go to **Attribution** → select a time range. You should see:
- Which tools appear most in first-touch position
- Which tools appear most in last-touch position
- Which combinations of tools produce the highest conversion rates

## Advanced: A/B testing workflows

If you're running two versions of a sequence, use the \`experimentId\` and \`stackVariant\` fields in your event payload to tag each event with the experiment it belongs to. IQPipe will segment attribution by variant in the experiment reports.

## Common pitfalls

- **Sending outcome events from the wrong tool:** The outcome event should come from the tool that recorded the outcome (e.g. HubSpot for deal closed), not from n8n/Make that orchestrates it.
- **Missing touchpoints in the middle of a funnel:** If a tool fires events that never reach IQPipe, the attribution chain has gaps. Use the Live Feed to spot missing events.
- **Long-running sequences:** Attribution looks back up to 200 touchpoints. For sequences longer than that, contact support.`,
  },

  {
    slug:       "full-gtm-stack",
    title:      "Building a complete GTM attribution stack",
    summary:    "A step-by-step blueprint for connecting your full outbound GTM stack — from prospecting to CRM — so every touchpoint is tracked, attributed, and reportable in IQPipe.",
    category:   "playbook",
    difficulty: "advanced",
    featured:   false,
    tags:       ["gtm","attribution","playbook","stack","outbound"],
    useCase:    ["gtm_workflow","attribution"],
    platform:   ["n8n","make","any"],
    relatedSlugs: ["multi-source-attribution","n8n-quickstart","make-quickstart","workflow-mirrors-guide"],
    body: `## The complete event map

A typical outbound GTM stack has five stages. Here's what to track at each one:

### Stage 1: Sourcing & enrichment
**Tools:** Clay, Apollo, ZoomInfo, Cognism, Lusha

| Event | When to fire |
|-------|-------------|
| \`contact_sourced\` | Contact added to your list |
| \`contact_enriched\` | Enrichment data fetched (email, company, title) |
| \`list_added\` | Contact added to a specific sequence or campaign |

### Stage 2: Outreach (email)
**Tools:** Instantly, Smartlead, Lemlist, Mailshake

| Event | When to fire |
|-------|-------------|
| \`email_sent\` | First email in sequence sent |
| \`email_opened\` | Open tracked |
| \`email_clicked\` | Link clicked |
| \`reply_received\` | Inbound reply detected |
| \`sequence_enrolled\` | Contact added to email sequence |

### Stage 3: LinkedIn outreach
**Tools:** HeyReach, Expandi, Dripify, Waalaxy

| Event | When to fire |
|-------|-------------|
| \`connection_sent\` | Connection request sent |
| \`connection_accepted\` | Connection accepted |
| \`linkedin_sent\` | Message sent to connection |
| \`reply_received\` | LinkedIn reply received |

### Stage 4: Qualification & meetings
**Tools:** Calendly, HubSpot, Salesforce, Outreach

| Event | When to fire |
|-------|-------------|
| \`meeting_booked\` | Calendar booking confirmed |
| \`meeting_completed\` | Meeting held |
| \`deal_created\` | Opportunity opened in CRM |
| \`deal_stage_changed\` | Stage progressed |

### Stage 5: Close & revenue
**Tools:** Salesforce, HubSpot, Stripe, Chargebee

| Event | When to fire |
|-------|-------------|
| \`deal_closed_won\` | Deal marked Closed Won |
| \`payment_received\` | First payment confirmed |
| \`subscription_created\` | Subscription activated |

## Implementation order

Start with the bottom of the funnel (revenue events) and work backwards. This ensures attribution data is available for outcomes first, then enriched with earlier touchpoints as you add them.

1. Connect your CRM (HubSpot or Salesforce) — outcome events are most valuable
2. Connect your email sequencer (Instantly/Smartlead) — largest event volume
3. Connect your LinkedIn tool — second-largest volume
4. Connect enrichment (Clay) — first-touch data
5. Connect calendar (Calendly) — meeting data for mid-funnel analysis

## Testing your setup

After connecting each tool, send a test event for a contact with a known email address. In **Live Feed**, you should see the event appear and link to the same lead (not create a new one). If a new lead is created, the email isn't matching — check field mappings for that source.`,
  },

  // ── Reference ───────────────────────────────────────────────────────────────

  {
    slug:       "event-naming-standards",
    title:      "Event naming standards for reliable tracking",
    summary:    "Use IQPipe's 56 canonical event names for best analytics coverage; custom event names work but won't appear in built-in funnel and attribution reports.",
    category:   "reference",
    difficulty: "beginner",
    featured:   false,
    tags:       ["events","naming","taxonomy","canonical","reference"],
    useCase:    ["gtm_workflow","data_cleaning"],
    platform:   ["any"],
    relatedSlugs: ["n8n-quickstart","make-quickstart","multi-source-attribution"],
    body: `## Why canonical names matter

IQPipe maps incoming event strings to one of 56 canonical event types using a 330+ alias dictionary and keyword matching. If your event name matches (exactly or via alias), it's automatically:
- Categorised into the right funnel stage
- Counted in built-in attribution reports
- Recognised as an outcome event (if applicable) to trigger attribution calculation

Custom names that don't match any alias are stored as-is and appear in reports as custom events, but won't benefit from automatic categorisation.

## Canonical events by category

### Sourcing
\`contact_sourced\` · \`contact_enriched\` · \`list_added\`

### Email outreach
\`email_sent\` · \`email_opened\` · \`email_clicked\` · \`reply_received\` · \`positive_reply\` · \`negative_reply\` · \`sequence_enrolled\` · \`sequence_completed\`

### LinkedIn outreach
\`connection_sent\` · \`connection_accepted\` · \`linkedin_sent\` · \`message_sent\`

### Phone & SMS
\`call_placed\` · \`call_answered\` · \`voicemail_left\` · \`sms_sent\` · \`sms_received\`

### Meetings
\`meeting_booked\` · \`meeting_completed\` · \`demo_completed\`

### CRM pipeline
\`contact_created\` · \`contact_updated\` · \`deal_created\` · \`deal_stage_changed\` · \`deal_closed_won\` · \`deal_closed_lost\` · \`proposal_sent\` · \`contract_signed\`

### Revenue (outcome events)
\`trial_started\` · \`trial_converted\` · \`subscription_created\` · \`subscription_upgraded\` · \`subscription_cancelled\` · \`payment_received\` · \`payment_failed\` · \`churn_detected\`

## Common aliases

You don't need to rename your existing events — IQPipe recognises hundreds of variants:

| Your event name | Maps to |
|----------------|---------|
| \`replied\`, \`email_reply\`, \`inbound_email\` | \`reply_received\` |
| \`sent\`, \`send_email\`, \`email_delivered\` | \`email_sent\` |
| \`accepted\`, \`invite_accepted\`, \`connected\` | \`connection_accepted\` |
| \`won\`, \`closed_won\`, \`deal_won\` | \`deal_closed_won\` |
| \`booked\`, \`meeting_scheduled\`, \`calendar_booking\` | \`meeting_booked\` |

## Custom events

For events outside the standard taxonomy (e.g. \`video_watched\`, \`feature_activated\`), define them under **Settings → Custom Events**. Custom events support:
- Custom label and channel assignment
- Category: \`signal\` (tracked but not an outcome) or \`outcome\` (triggers attribution)
- Description for team context`,
  },

  {
    slug:       "gdpr-consent-guide",
    title:      "Choosing the right GDPR consent basis",
    summary:    "For B2B outbound sales, 'legitimate_interest' is almost always the correct consent basis; use 'consent' only when you have an explicit opt-in from the contact.",
    category:   "reference",
    difficulty: "beginner",
    featured:   false,
    tags:       ["gdpr","consent","compliance","privacy"],
    useCase:    ["compliance"],
    platform:   ["any"],
    relatedSlugs: ["n8n-quickstart","make-quickstart"],
    body: `## Why consent basis is required

IQPipe processes personal data (email addresses, LinkedIn URLs, phone numbers) on your behalf. GDPR Article 6 requires a lawful basis for every processing operation. The \`consent.basis\` field in every API call records which basis applies to that specific event.

This isn't just box-ticking — if a contact exercises their right to erasure (Article 17), IQPipe needs the consent record to know which data to remove and what retention rules apply.

## The six lawful bases

### \`legitimate_interest\` ✅ Use for B2B outbound
You have a legitimate business interest in contacting this person, and it doesn't override their interests. This is the standard basis for **B2B prospecting, cold email, and LinkedIn outreach** where:
- You're targeting professional contacts in their professional capacity
- The contact would reasonably expect outreach given their role/industry
- You provide an easy opt-out mechanism

**When not to use it:** Consumer (B2C) outreach, or situations where the contact has explicitly objected.

### \`consent\` ✅ Use when you have explicit opt-in
The contact has given clear, specific, informed consent to be contacted. Use this for:
- Inbound leads who filled a form agreeing to contact
- Event attendees who opted in to follow-up
- Newsletter subscribers

### \`contract\` ✅ Use for existing customers
Processing is necessary to fulfil a contract with the contact. Use this for:
- Customer success events
- Billing and subscription events
- Events about people who have purchased from you

### \`legal_obligation\` · \`vital_interests\` · \`public_task\`
These are specialist bases rarely needed for GTM use cases. Use them only if you have specific legal advice recommending them.

## Practical setup

In your n8n/Make workflow, hardcode the consent basis for each event type:

\`\`\`json
{
  "consent": {
    "basis": "legitimate_interest",
    "source": "outbound-sequence-v3",
    "version": "2026-01"
  }
}
\`\`\`

Use \`version\` to track which version of your privacy policy or outreach policy was in effect. This is useful for audits and for knowing which contacts were processed under which terms.`,
  },

  {
    slug:       "quota-and-rate-limits",
    title:      "Quota and rate limits explained",
    summary:    "Monthly event quota resets on your billing date; per-minute rate limits reset every 60 seconds and are per-workspace, not per-IP.",
    category:   "reference",
    difficulty: "beginner",
    featured:   false,
    tags:       ["quota","rate-limit","billing","plans"],
    useCase:    ["debugging"],
    platform:   ["any"],
    relatedSlugs: ["live-feed-troubleshoot"],
    body: `## Two separate limits

IQPipe enforces two independent limits:

### Monthly event quota
The total number of events your workspace can ingest per billing month. Resets on your billing anniversary date.

| Plan | Monthly events |
|------|---------------|
| Trial | 10,000 |
| Free | 1,000 |
| Starter | 50,000 |
| Growth | 200,000 |
| Agency | Unlimited |

When you hit the monthly quota, events return **429 Too Many Requests** with \`"code": "QUOTA_EXCEEDED"\`. The sending tool receives a 429 and may retry — but IQPipe will continue rejecting until the quota resets or you upgrade.

Check current usage under **Settings → Billing → Usage**.

### Per-minute rate limit
Prevents burst traffic from overwhelming the ingestion pipeline. Resets every 60 seconds.

| Plan | Per-minute limit |
|------|-----------------|
| Trial / Free | 60 req/min |
| Starter | 120 req/min |
| Growth | 300 req/min |
| Agency | 600 req/min |

Rate-limited events return 429 with \`"code": "RATE_LIMITED"\` and \`"retryAfterSeconds": 60\`. Most tools (n8n, Make, Zapier) will automatically retry after the specified delay.

## Handling limits in n8n

Add an **Error Trigger** node connected to your HTTP Request node. When it catches a 429:
- Check if \`code === "RATE_LIMITED"\` → wait 60 seconds and retry
- Check if \`code === "QUOTA_EXCEEDED"\` → log and alert (retrying immediately won't help)

## Handling limits in Make.com

Use the built-in **Error Handler** module with a **Resume** directive. Set a 60-second delay before resuming for rate limit errors.

## Tips for high-volume workflows

- Spread event ingestion over time using delays between n8n nodes or Make.com sleep modules
- Batch enrichment runs during off-peak hours (early morning) to stay within per-minute limits
- For the Agency plan, contact support to discuss burst limit increases for large campaigns`,
  },

];

// ─── Seed function ─────────────────────────────────────────────────────────────

export async function ensureKbSeeded(): Promise<void> {
  try {
    // Upsert every article by slug so new articles are always added,
    // and existing articles are updated if content has changed.
    console.log("[kbSeed] Syncing knowledge base articles...");

    let added = 0;
    for (const a of ARTICLES) {
      const data = {
        title:        a.title,
        summary:      a.summary,
        body:         a.body,
        category:     a.category,
        tags:         JSON.stringify(a.tags),
        useCase:      JSON.stringify(a.useCase),
        platform:     JSON.stringify(a.platform),
        difficulty:   a.difficulty,
        featured:     a.featured,
        relatedSlugs: JSON.stringify(a.relatedSlugs),
      };
      const result = await prisma.kbArticle.upsert({
        where:  { slug: a.slug },
        update: data,
        create: { slug: a.slug, ...data },
      });
      if (result) added++;
    }

    console.log(`[kbSeed] Synced ${added} articles.`);
  } catch (err: any) {
    // Never crash server startup because of seed failure
    console.error("[kbSeed] Seed failed:", err.message);
  }
}
