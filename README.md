# AskSantorini.ai

Static site for **ASK SANTORINI AI**, a free live AI guide for Santorini visitors.

The site includes the live chat interface, useful starter questions, partner CTA, lightweight legal notices, and a contact mailto workflow.

## Project Structure

- `index.html` - page structure, SEO metadata, Open Graph tags, content sections
- `styles.css` / `styles.min.css` - responsive styling, CSS variables, layout, cards, forms, modals
- `script.js` / `script.min.js` - starter question interactions, contact mailto workflow, privacy/terms modals, live chat
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

CSP:

- `connect-src` allows `https://white-fog-d126.avatar68.workers.dev`.

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
