# Sedifex Admin Pages Guide

This guide explains the Sedifex Admin pages for operators, developers, and new team members.

This document is for GitHub only. It is not linked from the public site or from the admin UI.

---

## Local setup

Run the app locally from the project root:

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Create `.env.local` locally with the required admin login values and Firebase service account values. Do not commit `.env.local`.

Required groups of environment values:

- Admin login email and password
- Staff login email and password
- Firebase project ID
- Firebase service account client email
- Firebase service account private key

Optional values for the Marketing page:

- `MARKETING_APPS_SCRIPT_WEBHOOK_URL`
- `MARKETING_APPS_SCRIPT_TOKEN`

---

## Landing page

Path:

```text
/
```

Purpose:

A fast entry page for the admin console.

How to use:

1. Open the root URL.
2. Click **Log in to admin**.
3. Continue to the login page.

Expected design:

- Dark Sedifex card design
- Only one main action: **Log in to admin**
- No **View dashboard** button

---

## Login page

Path:

```text
/admin/login
```

Purpose:

Allows admin or staff users to sign in using the credentials stored in environment variables.

How to use:

1. Enter the configured admin or staff email.
2. Enter the matching password.
3. Click **Sign in to dashboard**.

After login, the app redirects to:

```text
/admin
```

---

## Overview page

Path: `/admin`

Purpose: The operations home page for Sedifex client businesses, payment exceptions, and manual settlements.

Shows:
- Business workspaces loaded from `stores` and `storeSettings`
- Failed payment records from `integrationOrders`
- Website bookings from `integrationBookings`
- Pending store payouts and recorded fees from `manualSettlements`
- Failed technical webhooks from `webhookDeliveries`
- Quick links to analytics, settlements, business profiles, and marketing

Important: Merchants fulfill their own orders. Do **not** label orders as delayed deliveries or offer platform admins physical fulfillment controls on the overview.

Money rules: paid order value belongs to merchants and is **not** Sedifex revenue. Only the `sedifexFee` field from manually recorded settlement ledgers is shown as a partial fee indicator, not total platform income.

Coverage: The dashboard reads a capped set of records in document-ID order. Treat displayed figures as operational snapshots, not accounting totals.

## Business Analytics page

Path: `/admin/analytics`

Purpose: Analyze loaded business order, booking, failed payment and manual settlement records for the selected period (7, 30, or 90 days). This replaces the old Sedifex Market traffic analytics interface.

Reporting is bounded and explicitly labeled: the date filter applies only to the loaded Firestore records. Do not use these values for payout reconciliation or final accounting.


---

## Stores page

Path:

```text
/admin/stores
```

Purpose:

Shows a directory of stores from Firestore.

Shows:

- Total stores
- Google Shopping connected stores
- Auto-sync enabled stores
- Stores needing integration review
- Store name
- Contact
- Location
- Integration status

How to use:

1. Open the Stores page.
2. Review store status.
3. Click a store row to open the store detail page.

---

## Store detail page

Path:

```text
/admin/stores/[storeId]
```

Purpose:

Shows one store in detail and allows safe Google Shopping setting updates.

Shows:

- Store name and ID
- Contact
- Phone
- Location
- Last updated date
- Google Shopping connection status
- Merchant ID
- Auto-sync status
- Integration API key preview/value from the document
- Integration base URL
- Sync status

Safe edit action:

The safe edit form can update only:

```text
googleShopping.catalogSync.autoSyncEnabled
googleShopping.catalogSync.integrationBaseUrl
```

Every update also writes admin update metadata and a store-level audit record.

Audit path:

```text
storeSettings/{storeId}/adminAudit/{timestamp}
```

Use this page when a store needs Google Shopping auto-sync enabled, disabled, or corrected with the right integration base URL.

---

## Marketplace page

Path:

```text
/admin/marketplace
```

Purpose:

Monitors SedifexMarket public catalog visibility.

Main collection:

```text
publicProducts
```

Shows:

- Total public products
- Visible products
- Hidden or blocked products
- Verified stores from public records
- Missing image count
- Missing price count
- Missing description count
- Missing store ID count
- Product/service split
- Products needing marketplace review

Use this page when products do not appear correctly on SedifexMarket homepage, search, category pages, or public store pages.

---

## Products page

Path:

```text
/admin/products
```

Purpose:

Checks product data quality and compares Sedifex product records with the public marketplace records.

Main collections:

```text
products
publicProducts
```

Shows:

- Products loaded
- Public product records
- Visible public products
- Products needing review
- Missing image
- Missing price
- Missing description
- Missing category
- Zero-stock physical products
- Products missing from publicProducts
- Physical products vs services
- Recently loaded products

Use this page before marketplace campaigns, Google Shopping syncs, or debugging missing products.

---

## Checkout page

Path:

```text
/admin/checkout
```

Purpose:

Monitors checkout, order, payment, and sync health.

Main collections:

```text
integrationOrders
stores
storeSettings
```

Shows:

- Integration order count
- Pending orders
- Pending payments
- Pending sync
- Active stores
- Stores missing settings
- Stores missing checkout config
- Orders missing store ID
- Orders with unknown store ID
- Failed or cancelled orders
- Recent integration orders

Use this page when checkout fails, a store is unavailable, or an order is not syncing back to Sedifex.

---

## Google Shopping page

Path:

```text
/admin/google-shopping
```

Purpose:

Monitors Google Merchant Center and Google Shopping sync readiness.

Main data areas:

```text
storeSettings.googleShopping
storeSettings.integrations.googleMerchant
```

Shows:

- Store settings count
- Merchant connected stores
- Auto-sync enabled stores
- Stores needing review
- Merchant ID
- Token health
- Sync state
- Last run
- Validation blockers

Use this page when Google Shopping sync fails, a store is missing a Merchant ID, or product validation blocks a sync.

---

## Integration Keys page

Path:

```text
/admin/integration-keys
```

Purpose:

Monitors Sedifex integration API keys.

Main collections:

```text
integrationApiKeys
stores
storeSettings
```

Shows:

- Total API keys
- Active keys
- Revoked keys
- Recently used keys
- Never-used keys
- Old unused keys
- Keys missing store ID
- Stores with many active keys

Security rule:

Do not display full API tokens in the UI. Only previews should be shown.

Use this page to find stale keys, revoked keys, risky keys, and stores with too many active credentials.

---

## Marketing Email page

Path:

```text
/admin/marketing
```

Purpose:

Creates marketing email campaigns and sends the campaign payload to Google Apps Script.

Main collections:

```text
stores
storeSettings
customers
marketingCampaigns
```

Writes campaign records to:

```text
marketingCampaigns/{campaignId}
```

Audience options:

- Stores only
- Available customers only
- Stores and available customers

How to use:

1. Confirm Apps Script sync shows ready.
2. Select the audience.
3. Enter sender name.
4. Enter subject.
5. Enter message.
6. Click **Send to Apps Script**.
7. Check the recent campaign status.

Apps Script receives a payload with campaign ID, audience, sender name, subject, message, recipient count, and recipient list.

Important:

Apps Script should handle the actual email send, unsubscribe/footer rules, and any extra delivery logging.

---

## Integrations page

Path:

```text
/admin/integrations
```

Purpose:

General integration overview page.

Use this page as a starting point before opening:

- `/admin/integration-keys`
- `/admin/webhooks`
- `/admin/deliveries`

Recommended future improvement:

Add summary cards for API keys, webhook endpoints, failed deliveries, and recent integration audit logs.

---

## Webhooks page

Path:

```text
/admin/webhooks
```

Purpose:

Webhook endpoint management and health monitoring.

Expected future data:

```text
webhookEndpoints
```

Should show:

- Store
- Webhook URL
- Subscribed events
- Status
- Secret configured or missing
- Last update
- Delivery health

Recommended future improvement:

Connect it to real webhook endpoint data and add activate, revoke, and delete actions.

---

## Deliveries page

Path:

```text
/admin/deliveries
```

Purpose:

Webhook delivery monitoring.

Should show:

- Successful deliveries
- Failed deliveries
- Retry count
- Endpoint URL
- Event type
- Store
- Last response status

Recommended future improvement:

Connect it to real delivery logs and group failures by store, event, and endpoint.

---

## Users page

Path:

```text
/admin/users
```

Purpose:

Admin and staff access overview.

Should show:

- Admin users
- Staff users
- Roles
- Store assignment
- Status
- Last update

Recommended future improvement:

Connect it to the real team/member collections and add invite, reset, and deactivate actions.

---

## Audit Logs page

Path:

```text
/admin/audit-logs
```

Purpose:

Trace sensitive admin actions.

Should show:

- Actor
- Action
- Store
- Collection/path affected
- Created date
- Before and after values where available

Recommended future improvement:

Read from integration audit logs, marketing campaign records, and store-level admin audit subcollections.

---

## Settings page

Path:

```text
/admin/settings
```

Purpose:

Admin configuration and readiness checks.

Should show:

- Firebase readiness
- Apps Script webhook readiness
- Login env readiness
- Optional monitoring readiness

Recommended future improvement:

Add read-only environment checks so operators know what is missing without exposing secret values.

---

## Recommended daily workflow

1. Open `/admin` for pending manual payouts, payment exceptions and webhook failures.
2. Review `/admin/settlements` and verify outstanding payout ledger entries.
3. Open `/admin/stores` for client business setup or subscription questions.
4. Use `/admin/analytics` and `/admin/platform-activity` to examine business activity, not marketplace traffic.
5. Investigate payment configuration in `/admin/checkout-health`.
6. Use `/admin/marketing` for Sedifex Team communication.

Do not use admin settlement or overview screens to change merchant shipping/delivery statuses. Existing legacy pages may remain routable during migration but are not surfaced as core navigation.


---

## Troubleshooting

### Page looks plain or unstyled

Confirm that `app/layout.tsx` imports the global stylesheet:

```ts
import "./globals.css";
```

Then clear Next.js cache and restart:

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run dev
```

### Firestore pages show setup warnings

Check local or Vercel environment values for Firebase service account access, then restart the app.

### Marketing page says Apps Script URL is missing

Add the marketing Apps Script webhook URL to the environment and restart the app.

### New dependency was added but build fails

Run:

```powershell
npm install
npm run build
```

Then commit `package-lock.json` if it changed.

---

## Security reminders

- Do not commit `.env.local`.
- Do not expose Firebase service account values.
- Rotate service account keys if they are exposed.
- Do not display full API tokens in the admin UI.
- Only send marketing emails to valid audiences.
- Apps Script should enforce unsubscribe and footer rules before sending campaigns.
