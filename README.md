# AskSantorini.ai

Static site for **ASK SANTORINI AI**, a free live AI guide for Santorini visitors.

The site includes the live chat interface, useful starter questions, partner CTA, lightweight legal notices, and a contact mailto workflow.

## Project Structure

- `index.html` - page structure, SEO metadata, Open Graph tags, content sections
- `styles.css` / `styles.min.css` - responsive styling, CSS variables, layout, cards, forms, modals
- `script.js` - starter question interactions, contact mailto workflow, privacy/terms modals, live chat and concierge decision logic
- `robots.txt` / `sitemap.xml` - search engine crawl directives
- `_headers` - Cloudflare Pages security headers
- `404.html` - static not-found fallback

## Local Development

Open `index.html` directly in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 8787
```

Then visit:

```text
http://localhost:8787
```

## Live AI Chat Architecture

The live chat flow is:

```text
Frontend -> Cloudflare Worker -> Gemini API
```

Worker endpoint:

```text
https://white-fog-d126.avatar68.workers.dev
```

The frontend expects the Worker to return:

```json
{ "reply": "..." }
```

Security:

- No API keys are stored in the frontend.
- The Gemini API key is stored as the Cloudflare Worker secret `GEMINI_API_KEY`.

Worker environment:

- `GEMINI_API_KEY` - required Cloudflare Worker secret.
- `GEMINI_MODEL` - optional model override. Defaults to `gemini-2.5-flash`.

Truth Layer entity data comes only from the `entities_truth_layer` tab in the production Google Spreadsheet:

```text
Spreadsheet ID: 1OlhF14hzMGc0jweKgq-3O_PtSKn0E9-wBbZXZBano9E
CSV: https://docs.google.com/spreadsheets/d/1OlhF14hzMGc0jweKgq-3O_PtSKn0E9-wBbZXZBano9E/gviz/tq?tqx=out:csv&sheet=entities_truth_layer
```

Required governance columns: `entity_id`, `name`, `type`, `phone`, `website`, `maps_url`, `active`.
Optional columns: `address`, `tags`, `priority`.
Supported entity `type` values are `hotel`, `villa`, `restaurant`, `beach`, `club`, `transport`, `service`, and `place`.
All phone numbers, websites, map links and addresses must come from validated rows in the published Google Sheets CSV. The LLM only writes natural language guidance; factual contact data is resolved by `entity_id` and injected into CTA buttons after generation.
Rows with missing required fields, invalid phones, broken URLs, invalid map links, unsupported types, inactive status, or duplicate lower-priority entities are rejected before they enter the Truth Layer.
The frontend loads active entities from `entities_truth_layer` and ranks eligible matches deterministically with only Truth Layer row fields:

```text
score = priority
```

CSP:

- `connect-src` allows `https://white-fog-d126.avatar68.workers.dev`, `https://docs.google.com`, `https://script.google.com` and `https://script.googleusercontent.com`.

## Partner Knowledge

Partner/entity data is updated live from the `entities_truth_layer` tab.
If the Sheet is unavailable, the frontend fails gracefully with no affiliate suggestion.
The frontend selects a single relevant affiliate, stores its active `entity_id` for the session, and sends only non-contact entity context to the Worker.
The Worker does not detect intent, rank affiliates, or construct concierge rules.

`affiliate_performance` is a derived reporting tab only. It is regenerated from `events_analytics` and is never used as input for Truth Layer resolution, CTA generation, or response generation.

## Single Event Write Layer

`apps-script/affiliate-events.gs` contains the Google Apps Script Web App endpoint for appending canonical events to the production spreadsheet `events_analytics` tab.
The deployed Web App URL is configured as `eventWebhookUrl` in `worker.js`; the Worker forwards one canonical event write per interaction event.

Canonical frontend event:

```text
timestamp, session_id, message_id, user_input, bot_response, intent, event_type, affiliate_id, entity_id
```

`events_analytics` columns:

```text
timestamp, session_id, message_id, user_input, bot_response, intent, event_type, affiliate_id, entity_id
```

## Deploy to Cloudflare Pages

1. Push these files to a Git repository.
2. In Cloudflare Pages, create a new project from that repository.
3. Use these build settings:

   ```text
   Framework preset: None
   Build command: leave empty
   Build output directory: /
   ```

4. Deploy.
5. Connect the custom domain `asksantorini.ai` in Cloudflare when ready.

## Next Updates

- Add richer live-chat guidance based on visitor context.
- Replace the contact mailto flow with a privacy-friendly contact backend if needed.
- Add real privacy and terms pages before collecting data.
- Add real partner links only after partnerships are confirmed.
- Add analytics only if privacy-friendly and clearly disclosed.
