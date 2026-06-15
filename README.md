<div align="center">
  <img src="public/logo.png" alt="MMCM Logo" width="120" />

  <h1>My MC Modlist</h1>

  <p>A modern, collaborative Minecraft modpack manager — search mods, build packs, auto-resolve dependencies, and export ready-to-use modpacks in seconds.</p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" />
    <img src="https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?style=flat-square&logo=firebase" />
    <img src="https://img.shields.io/badge/Tailwind-v4-38BDF8?style=flat-square&logo=tailwindcss" />
    <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
  </p>

  <p>
    <a href="https://my-mc-modlist.vercel.app">🌐 Live Demo</a>
    &nbsp;·&nbsp;
    <a href="#-getting-started">🚀 Get Started</a>
    &nbsp;·&nbsp;
    <a href="#-architecture">🏗️ Architecture</a>
  </p>
</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Mod Search** | Search mods across **Modrinth** and **CurseForge** (via ModpackIndex) simultaneously |
| 📦 **Modpack Manager** | Create version-pinned packs with a specific Minecraft version + mod loader |
| ⚡ **Auto Dependency Resolution** | Automatically resolves and adds required mod dependencies |
| 🎯 **Smart Filtering** | Filter by loader (Fabric, Forge, NeoForge, Quilt), MC version, category, and environment |
| 🤝 **Collaborative Packs** | Share packs with other users for collaborative editing |
| 📤 **Export Ready** | One-click export as **`.mrpack`** (Modrinth format) or client-side **ZIP** |
| 💬 **Activity Feed** | Real-time per-pack activity log and comment feed |
| 🌙 **Dark / Light Mode** | Fully themed UI with system preference support |
| 🔐 **Google Auth** | Sign in with Google via Firebase Authentication |

---

## 🛠️ Tech Stack

```
Frontend        Next.js 16 (App Router) · React 19 · Tailwind v4 · TanStack Query
Backend         Next.js Route Handlers (Node runtime) · Firebase Admin SDK
Auth            Firebase Authentication (Google OAuth)
Database        Firestore (Singapore / asia-southeast1)
Storage         Firebase Storage (mod JARs, manual uploads)
APIs            Modrinth v2 · ModpackIndex v1 · CFWidget (CurseForge metadata)
Packaging       JSZip (client-side ZIP export) · .mrpack format
Deployment      Vercel
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 8 (recommended) or npm
- A Firebase project with Firestore + Storage + Google Auth enabled

### Installation

```bash
# Clone the repository
git clone https://github.com/qninhdt/my-mc-modlist.git
cd my-mc-modlist

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# → Fill in your Firebase credentials (see Environment section below)

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔧 Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
# ── Firebase Client SDK (safe to expose — these are public by design) ──
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# ── Firebase Admin SDK (server-only — NEVER expose these) ──
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

> ⚠️ **Never** prefix Admin credentials with `NEXT_PUBLIC_` and never commit `.env.local`.

---

## 🔥 Firebase Setup

### 1. Enable Google Sign-In

1. Go to [Firebase Console → Authentication → Sign-in method](https://console.firebase.google.com/project/_/authentication/providers)
2. Enable **Google** provider → set a support email → **Save**
3. Add your domains under **Authentication → Settings → Authorized domains** (include `localhost` and your Vercel URL)

### 2. Deploy Security Rules

```bash
firebase deploy --only firestore:rules,storage:rules
```

### 3. Configure Storage CORS

```bash
gcloud storage buckets update gs://<your-bucket>.firebasestorage.app --cors-file=cors.json
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│   TanStack Query → authedFetch (Bearer token) → /api/*      │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   proxy.ts (Edge MW)    │  ← Bearer presence check
              │   Public routes bypass  │    (DoS guard, no crypto)
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Next.js Route Handlers │  ← verifyIdToken (Node)
              │  /api/search            │
              │  /api/mod/[id]          │
              │  /api/resolve           │
              └──┬──────────────────┬───┘
                 │                  │
    ┌────────────▼──┐    ┌──────────▼──────────┐
    │  Modrinth v2  │    │  ModpackIndex v1     │
    │  (versions,   │    │  (CurseForge badge,  │
    │   search,     │    │   cross-platform     │
    │   deps)       │    │   discovery)         │
    └───────────────┘    └─────────────────────┘
```

**Key design decisions:**

- **Two-API split**: ModpackIndex handles cross-platform discovery + CurseForge badges. Modrinth v2 handles version files, CDN download URLs, and the dependency graph.
- **Auth model**: Firebase stores sessions in IndexedDB (not cookies) — page protection is enforced client-side in the `(app)` layout; the `/api/*` gate runs in `proxy.ts` (Bearer-presence) + `verifyRequest` (cryptographic `verifyIdToken` in Node runtime).
- **Public read routes**: `/api/search`, `/api/mod/*`, and `/api/minecraft/*` are intentionally open so unauthenticated users can browse mods freely.
- **Privileged ops** (invite-accept, signed jar URLs) run as Next.js route handlers with firebase-admin — no Cloud Functions needed.

---

## 📁 Project Structure

```
├── app/
│   ├── (app)/              # Authenticated app shell
│   │   ├── search/         # Mod search & discovery
│   │   ├── packs/          # Modpack management
│   │   ├── mods/[id]/      # Mod detail pages
│   │   └── profile/        # User profile
│   ├── api/                # API route handlers
│   │   ├── search/         # Mod search endpoint
│   │   ├── mod/[id]/       # Mod detail + versions
│   │   └── resolve/        # Dependency resolver
│   └── layout.tsx          # Root layout + fonts
├── components/
│   ├── layout/             # AppShell, Header, Footer, Nav
│   ├── mods/               # ModCard, ModDetail, Filters
│   └── modpacks/           # PackCard, PackHeader, Export
├── lib/
│   ├── api/                # Modrinth + ModpackIndex clients
│   ├── auth/               # Firebase auth hooks
│   ├── modpacks/           # Pack queries + mutations
│   └── resolve/            # Dependency resolution logic
├── public/
│   ├── logo.png            # App logo
│   └── favicon.ico         # Browser icon
├── proxy.ts                # Edge middleware (auth gate)
└── firestore.rules         # Firestore security rules
```

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/qninhdt">qninhdt</a></sub>
</div>
