# Bantay

Bantay keeps watch over your Gmail and shows only what needs attention:

- **Banks**: unread transactions, transfers, security and payment-due alerts from the last 3 days
- **Logistics**: unread order, shipping and delivery updates from the last 3 days
- **Subscriptions**: Claude Pro renewal, unpaid Omantel and Pag-IBIG months, and whether each credit card's dues are paid (Maya Black, MariCard, Amex, Bank Muscat cards)

It reads your mail with **read-only** access, keeps no copy of it, and only the Google accounts you list can sign in.

Setup takes about 20 minutes and happens in three places: Google Cloud (sign-in), Vercel (hosting) and Upstash (saving "Mark paid").

---

## 1. Put the code on GitHub

1. Create a new **private** repository on GitHub, for example `bantay`.
2. Upload the contents of this folder (unzip first). The easiest way is the GitHub website: **Add file → Upload files**, drag everything in, then **Commit changes**.

## 2. Create the project on Vercel (first deploy)

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and **Import** your `bantay` repository.
2. Leave the settings as they are (Vercel detects Next.js) and click **Deploy**. This first deploy will show a sign-in error until the next steps are done. That's expected.
3. Copy your site address from the project page, for example `https://bantay-abc123.vercel.app`. You need it in step 3.

## 3. Set up Google sign-in

All of this is in [Google Cloud Console](https://console.cloud.google.com/).

1. **Create a project**: top bar → project picker → **New project** → name it `Bantay` → **Create**, then select it.
2. **Turn on the Gmail API**: **APIs & Services → Library** → search "Gmail API" → **Enable**.
3. **Set up the consent screen**: **APIs & Services → OAuth consent screen** (called **Google Auth Platform** in newer consoles):
   - App name: `Bantay`. User support and developer contact: your Gmail address.
   - Audience / user type: **External**.
   - Under **Audience → Test users**, add your Gmail address.
   - Under **Data access**, add the scope `.../auth/gmail.readonly` (plus `openid` and `email`).
4. **Create the sign-in keys**: **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**, name `Bantay`.
   - **Authorized redirect URIs**: add `https://YOUR-SITE.vercel.app/api/auth/callback` (your address from step 2.3). To run it on your computer too, also add `http://localhost:3000/api/auth/callback`.
   - Click **Create** and copy the **Client ID** and **Client secret**.

> **Weekly sign-in:** while the Google app is in "Testing", Google ends the sign-in every 7 days, so you'll tap "Sign in with Google" about once a week. To stop that, go to **Audience** and click **Publish app**. Google then shows an "unverified app" warning when you sign in. For your own use, click **Advanced → Go to Bantay**. That's safe because it's your own app, and sign-ins then last until you revoke them.

## 4. Add the settings in Vercel

In Vercel: your project → **Settings → Environment Variables**. Add each of these for **Production** (and Preview if you like):

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID from step 3.4 |
| `GOOGLE_CLIENT_SECRET` | Client secret from step 3.4 |
| `SESSION_SECRET` | A long random string. Run `openssl rand -base64 48`, or use any password generator set to 48+ characters |
| `ALLOWED_EMAILS` | Your Gmail address. Add more, separated by commas, only for people you've also added as Google test users |

## 5. Save "Mark paid" across devices (Upstash Redis, free)

1. In your Vercel project, open the **Storage** tab → **Create Database** (or **Browse Marketplace**) → **Upstash for Redis** → choose the **Free** plan → create it.
2. **Connect** it to the `bantay` project. Vercel adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` settings for you.

Skip this step and Bantay still works, but "Mark paid" is saved in each browser separately.

## 6. Redeploy and sign in

1. Vercel → **Deployments** → the latest one → **⋯ → Redeploy**. Settings only take effect after a redeploy.
2. Open your site and tap **Sign in with Google**. On Google's screen, tick the box that allows reading your Gmail.
3. **On your phone**: open the site, then **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home screen** (Android). Bantay opens like an app with the eye icon.

---

## Troubleshooting

| You see | Fix |
|---|---|
| Google says **redirect_uri_mismatch** | The redirect URI in step 3.4 must match your site exactly, ending in `/api/auth/callback`, with no extra slash |
| "This Google account isn't on Bantay's allowed list" | Check `ALLOWED_EMAILS` in Vercel, then redeploy |
| Google says **Access blocked: app has not completed verification** | Add your Gmail address under **Test users** (step 3.3) |
| "Gmail access wasn't granted" | Sign out, sign in again, and tick the Gmail checkbox on Google's screen |
| "Google sign-in expired" | Normal once a week in Testing mode. Sign in again, or publish the Google app (see step 3) |
| Server error mentioning `SESSION_SECRET` | Add it in step 4 (at least 32 characters) and redeploy |

## Run it on your computer (optional)

Needs Node.js 20 or newer.

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev                  # open http://localhost:3000
```

## How it works

- `app/api/auth/*`: Google sign-in. Your refresh token is kept in an encrypted, httpOnly cookie; nothing about your mail is stored on a server.
- `app/api/gmail/*`: searches Gmail with read-only access and returns only the emails the dashboard needs.
- `lib/rules.js`: which senders count, what's important, and how bills and card payments are matched. Edit this to add a bank, a card or a subscription.
- `app/api/marks`: saves your "Mark paid" choices to Upstash Redis.
