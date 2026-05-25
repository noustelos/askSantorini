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

Frontend affiliate data comes from the published Google Sheets CSV:

```text
https://docs.google.com/spreadsheets/d/1iOYyrEkTfhmUCXRRjRaQsc0XCWDRWFSQzBME0xj_W0U/export?format=csv&gid=0
```

Required columns: `active`, `name`, `type`, `priority`, `tags`, `clicks`, `impressions`, `intent_strength`, `context_boost`, `url`.
Supported affiliate `type` values are `transport`, `hotel`, and `tour`.
The frontend loads active affiliates from the published Google Sheets CSV and ranks them with:

```text
score = priority + (clicks / (impressions + 1)) + intent_strength + context_boost
```

CSP:

- `connect-src` allows `https://white-fog-d126.avatar68.workers.dev`, `https://docs.google.com`, `https://script.google.com` and `https://script.googleusercontent.com`.

## Partner Knowledge

Partner data is updated live from the published Google Sheets monetization log.
If the Sheet is unavailable, the frontend fails gracefully with no affiliate suggestion.
The frontend selects a single relevant affiliate and sends the final structured prompt to the Worker.
The Worker does not detect intent, rank affiliates, or construct concierge rules.

## Single Event Write Layer

`apps-script/affiliate-events.gs` contains the Google Apps Script Web App endpoint for appending the single canonical event to analytics and monetization sheet tabs.
The deployed Web App URL is configured as `eventWebhookUrl` in `script.js`, then fanned out to `?sink=analytics` and `?sink=monetization`.

Canonical frontend event:

```text
timestamp, session_id, user_message, bot_response, intent, affiliate, event_type
```

Analytics columns:

```text
timestamp, session_id, user_message, bot_response, intent, affiliate, event_type
```

Monetization columns:

```text
timestamp, affiliate, event_type, intent
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
