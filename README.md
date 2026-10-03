<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/d3551549-a6bc-4d67-a341-f1c18d7289d8

## Architecture & Production Deployment

For complete details on the dual-runtime topology, see [ARCHITECTURE.md](ARCHITECTURE.md).

- **Authoritative Production Runtime**: Node.js + Express (`server.ts`) running on Cloud Run.
- **Authoritative Production Structured Database**: Cloudflare D1 SQL (accessed via `server/db.ts`) for structured application records (users, conversations, messages, memories, file metadata, admin logs).
- **Authoritative Production Object Storage**: Supabase Storage (`aestific-files` bucket) for binary assets (uploads, PDFs, images, generated media) with automated 30-day retention cleanup.
- **Alternative Edge Runtime**: Cloudflare Worker (`server/worker.ts`) with Cloudflare D1 — secondary/alternative deployment target only, NOT active production runtime unless explicitly deployed later.
- **Admin Gateway**: Multi-step Sentinel security gateway with discreet sidebar access.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
