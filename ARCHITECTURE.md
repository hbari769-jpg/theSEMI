# Aestific AI — Production Architecture & Runtime Topology

## 1. Executive Summary & Runtime Topology

Aestific AI is designed with an authoritative production architecture and a synchronized edge deployment option:

| Component | Authoritative Production Runtime | Edge Alternative Target |
| :--- | :--- | :--- |
| **Runtime Platform** | **Node.js 20+ Express (Cloud Run / Container)** | Cloudflare Workers (Alternative Edge Target) |
| **Entry Point** | `server.ts` | `server/worker.ts` |
| **Storage Bucket** | `aestific-files` (Supabase Storage) | `aestific-files` (Supabase Storage) |
| **Primary Database** | **Authoritative Cloudflare D1 SQL via `server/db.ts`** | Cloudflare D1 (`server/d1.ts`) |
| **Scheduled Retention** | Daily Automated Cron (`server/cleanup.ts`) | Daily Edge Cron Trigger (`0 0 * * *`) |
| **Admin Gateway** | Sentinel 5-Step Verification & Token Authority | Sentinel 5-Step Verification & Token Authority |

---

## 2. Authoritative Production Runtime: Cloud Run / Node.js

The **authoritative production environment** runs on Node.js / Express in a sandboxed container:
- **Port & Host**: Binds to `0.0.0.0:3000`.
- **Static Assets & SPA**: Serves the compiled React Vite SPA from `dist/` with security headers.
- **API Routes**: Exposes hardened REST endpoints under `/api/*`.
- **Durable Database Layer**:
  - `server/db.ts` implements a unified, asynchronous `Database` engine.
  - In production (`NODE_ENV === 'production'`), it connects directly to **Cloudflare D1 SQL** via the resilient Cloudflare D1 HTTP client.
  - **Zero Local Filesystem Dependency**: Eliminates ephemeral `database.json` dependency in production; all data survives Cloud Run cold-starts, instance restarts, and fresh revisions.
  - **Multi-Instance Concurrency**: All Cloud Run container instances query and mutate the same authoritative D1 database, guaranteeing immediate write consistency across instances.
  - **ACID Batch Operations**: Multi-table operations (such as user deletion across 7 relational tables) execute as atomic SQL batches.
  - **No Silent Fallbacks**: If D1 connectivity fails in production, requests fail fast with explicit database connectivity errors rather than silently degrading to local ephemeral storage.
- **Data Ownership Division**:
  - **Cloudflare D1 (Structured Application Data)**: Authoritative relational database storing structured records: users, conversations, messages, memories, file metadata, usage data, support tickets, admin logs, admin/security state, and other relational records.
  - **Supabase Storage (Binary Object Storage)**: Authoritative object store for binary assets: uploaded files, PDFs, images, videos/audio where applicable, and generated image assets (`aestific-files` bucket).
  - The system avoids duplicating authoritative data between D1 and Supabase Storage (structured relational metadata resides in D1; binary payloads reside in Supabase Storage).
- **Scheduled Retention Engine**:
  - Automatically triggers daily at midnight UTC (`0 0 * * *`) via `server/cleanup.ts`.
  - Scans for all messages and files created strictly greater than 30 days ago (`created_at < now - 30d`).
  - Purges corresponding objects from the Supabase Storage bucket (`aestific-files`).
  - **Safe Partial Failure Handling**: If Supabase Storage deletion fails for any object (e.g., network timeout or service error), the file's database record is intentionally preserved and not dropped, ensuring that subsequent retention runs will safely retry deleting the storage object.
  - Purges corresponding local disk cache files.
  - Purges empty conversation threads left behind.
  - Logs structured, sanitized audit entries into the admin log.

---

## 3. Edge Target: Cloudflare Worker

`server/worker.ts` provides an alternative edge-native deployment targeting Cloudflare Workers and Cloudflare D1:
- Configured via `wrangler.jsonc`.
- **Secondary / Alternative Target Only**: The Cloudflare Worker + D1 edge implementation is an alternative/secondary deployment target and is **NOT** receiving active production traffic unless explicitly deployed later.
- Maintains strict parity with `server.ts`:
  - Uses the same Supabase bucket (`aestific-files`).
  - Implements the same 30-day retention cleanup logic in its `scheduled` handler.
  - Implements the same 5-step Sentinel admin verification protocol.
- Useful for edge caching and distributed low-latency scenarios where Cloudflare D1 edge execution is preferred.

---

## 4. Admin Access & Sentinel Security Gateway

Admin functionality is protected by multi-layered defenses:
1. **Discreet Entry**: The sidebar footer displays `"All rights reserved"` without any admin labels, icons, or tooltips.
2. **Access Verification (`/api/admin/check-access`)**:
   - Only authenticated users listed in `ADMIN_EMAILS` receive `{ authorized: true }`.
   - All other users receive HTTP 403 Forbidden or HTTP 401 Unauthorized without leaking sensitive system information.
3. **Sentinel 5-Step Gateway**:
   - Candidate administrators must pass all 5 sequential cryptographically secure verification challenges (`ADMIN_STEP1_SECRET` through `ADMIN_STEP5_SECRET`).
   - Replay attacks and out-of-sequence submissions are rejected.
   - Brute force attempts trigger progressive exponential rate limiting and lockout.
4. **Elevated Token**:
   - Successful completion grants a short-lived (1-hour) elevated JWT token (`isAdmin: true`).
   - Revoked immediately upon logout.

---

## 5. Single-Runtime Authority & Split-Brain Prevention Policy

To maintain absolute data integrity and eliminate any source-of-truth ambiguity:

1. **Sole Production Authority**:
   - **Active Production Runtime**: Node.js + Express (`server.ts`) on Cloud Run.
   - **Active Production Structured Database**: Authoritative Cloudflare D1 SQL via `server/db.ts` (storing users, conversations, messages, memories, file metadata, usage, tickets, logs, security state).
   - **Active Production Object Storage**: Authoritative Supabase Storage (`aestific-files` bucket) for binary assets (uploads, PDFs, images, generated media).
   - **Active Retention Engine**: Node.js daily background retention cron (`server/cleanup.ts`).
   - **Active Admin Gateway**: Implemented on the Node.js Express server (`server.ts`).
   - **Frontend Consumption**: The compiled SPA is served by Node.js Express and communicates exclusively with Node.js `/api/*` endpoints.

2. **Alternative Edge Target Role (Cloudflare Worker & D1 Edge Runtime)**:
   - `server/worker.ts` and `server/d1.ts` provide an **optional, alternative/secondary edge-deployment target**.
   - Cloudflare Worker edge code is **NOT** active in production and is **NOT receiving active production traffic** unless explicitly deployed later.
   - The repository configuration (`wrangler.jsonc`) retains placeholder configuration for optional edge deployment.

3. **Split-Brain Prevention Mandate**:
   - Concurrent dual-master operation between the active Cloud Run runtime and an edge Worker runtime is **strictly forbidden**.
   - Cloud Run is the single authoritative production API/runtime; Cloudflare D1 is the single authoritative structured database (accessed via `server/db.ts`); Supabase Storage is the single authoritative object storage.
   - The system does NOT perform concurrent split writes across two disparate runtime authorities.
   - The Cloudflare Worker edge deployment remains an alternative/secondary target that does not run concurrently with Cloud Run or process production traffic.

