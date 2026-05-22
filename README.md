# AskSantorini.ai Landing Page

Static version 0.1 landing page for **ASK SANTORINI AI**, a free AI guide for Santorini visitors.

This MVP is designed to go live before the chatbot is ready. It includes a premium coming-soon landing page, example question previews, partner CTA, lightweight legal notices, and an early-access mailto workflow.

## Project Structure

- `index.html` - page structure, SEO metadata, Open Graph tags, content sections
- `styles.css` / `styles.min.css` - responsive styling, CSS variables, layout, cards, forms, modals
- `script.js` / `script.min.js` - example answer previews, early-access mailto workflow, privacy/terms modals
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

- Connect the `Start Asking` section to the real chatbot when ready.
- Replace the early-access mailto flow with a real privacy-friendly email capture service or backend.
- Add real privacy and terms pages before collecting data.
- Add real partner links only after partnerships are confirmed.
- Add analytics only if privacy-friendly and clearly disclosed.
