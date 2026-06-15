# Deployment Documentation

This document describes the production deployment configuration, links, and rollback procedures for the Minecraft Modpack Manager web application.

## Production Details

- **Hosting Platform**: Vercel
- **Production URL**: [https://my-mc-modlist.vercel.app](https://my-mc-modlist.vercel.app)
- **Vercel Project Scope**: `qninhdts-projects/my-mc-modlist`
- **Build Command**: `next build`
- **Output Directory**: `.next`

---

## Environment Variables

All necessary variables from `.env.local` have been securely synced to the Vercel project configuration across all environments (Production, Development, and Preview). 

| Environment Variable | Target Environments | Purpose |
|----------------------|---------------------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Production, Development | Firebase Client Web SDK configuration |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Production, Development | Firebase Client Web SDK configuration |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Production, Development | Firebase Client Web SDK configuration |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Production, Development | Firebase Client Web SDK configuration |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Production, Development | Firebase Client Web SDK configuration |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Production, Development | Firebase Client Web SDK configuration |
| `UPSTREAM_USER_AGENT` | Production, Development | Custom agent identifier for upstream APIs (Modrinth / ModpackIndex) |
| `FIREBASE_ADMIN_PROJECT_ID` | Production, Development | Server-only Firebase Admin Project ID |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Production, Development | Server-only Firebase Admin Client email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Production, Development | Server-only Firebase Admin private key |

---

## CORS & Upstream Configuration

- **Firebase Storage CORS**: Wildcard entry (`https://*.vercel.app`) in `cors.json` covers the production site and any preview branches. No additional action is needed to retrieve files client-side.
- **Firebase Auth Authorized Domains**: Ensure `my-mc-modlist.vercel.app` is added to the Authorized Domains list in the [Firebase Authentication console](https://console.firebase.google.com/project/mc-modpack-mgr-39163/authentication/settings).

---

## Rollback Instructions

If a production deployment introduces a regression, you can revert to the last working deployment.

### Method 1: Using the Vercel CLI (Recommended)

To rollback the production domain to a specific deployment ID or URL:

```bash
# Get the list of recent deployments to find the desired target ID
npx vercel list

# Rollback to the previous deployment
npx vercel rollback <deployment-id-or-url>
```

### Method 2: Via Vercel Dashboard

1. Navigate to the Vercel Dashboard: **qninhdts-projects/my-mc-modlist**.
2. Go to the **Deployments** tab.
3. Locate the previous successful deployment.
4. Click the three dots (`...`) icon on the right side of the deployment list entry.
5. Click **Promote to Production** and confirm.
