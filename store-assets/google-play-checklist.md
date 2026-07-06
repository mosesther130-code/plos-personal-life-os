# PLOS — Google Play Console Submission Checklist

Step-by-step guide for what you (the account owner) must do inside the
Google Play Console. This is your at-the-console companion — everything
referenced here has already been prepared in `/app/store-assets/` and
`/app/frontend/`.

---

## 0. One-time account setup (skip if done)

1. Sign in to https://play.google.com/console with the Google account you
   plan to publish PLOS from.
2. If this is a brand-new account, pay the one-time $25 registration fee.
3. Complete developer profile: legal name (Moses Ndifon), address, email
   (plos.support@gmail.com), website (optional).

## 1. Create the app

1. Click **All apps → Create app**.
2. App name: **PLOS**
3. Default language: **English (United States)**
4. App or game: **App**
5. Free or paid: **Free**
6. Declarations: accept both.
7. Click **Create app**.

## 2. Set up your app (left sidebar → Set up your app)

Work through each row top-to-bottom.

### 2a. Privacy policy
- URL: **https://mosesther130-code.github.io/plos-personal-life-os/privacy-policy.html**
- Confirm the URL loads in an incognito browser tab before saving.

### 2b. App access
- **All functionality is available without special access.** (User accounts are self-serve.)

### 2c. Ads
- **No, my app does not contain ads.**

### 2d. Content ratings
1. Category: **Utility / Reference / Other**
2. Email: **plos.support@gmail.com**
3. Answer questionnaire using `/app/store-assets/age-rating.md`.
4. Expected assignment: **Teen (13+)**.

### 2e. Target audience and content
- Target age groups: **13–17** and **18+**. (Do NOT include 12 and under.)
- Contains ads: **No**.
- Appeals to children: **No**.

### 2f. News app declaration
- **No, my app is not a news app.**

### 2g. COVID-19 contact tracing / status app
- **No**.

### 2h. Data safety
- Complete the form using answers in `/app/store-assets/data-safety-form.md`.

### 2i. Government apps
- **No, my app is not a government app.**

### 2j. Financial features
- **Yes — my app has financial features.**
- Sub-category: **Banking / Financial account aggregator** (Plaid-based).
- Provide the Plaid client ID for verification if requested.

### 2k. Health
- **No, my app is not a health app.** (Wellness tracking is self-reported
  and not medically diagnostic. If Google flags this, choose "Provides health
  information" — not "Medical device".)

### 2l. Store settings
- App category: **Finance** (primary) or **Productivity**
- Tags: **Finance**, **Productivity**, **Personal**, **Life management**
- Store listing contact:
  - Email: **plos.support@gmail.com**
  - Phone: (optional — leave blank if you prefer)
  - Website: (optional)

## 3. Store listing (left sidebar → Main store listing)

- **App name:** PLOS
- **Short description (80 chars):** paste from `/app/store-assets/descriptions.txt` — line labeled SHORT.
- **Full description (4000 chars):** paste from `/app/store-assets/descriptions.txt` — the block labeled FULL.
- **App icon (512×512):** upload `/app/frontend/assets/store/plos_icon_512.png`.
- **Feature graphic (1024×500):** upload `/app/frontend/assets/store/plos_feature_graphic.png`.
- **Phone screenshots (min 2, max 8):** upload the 6 PNGs from `/app/frontend/assets/store/screenshots/` (screenshot_01_dashboard.png through screenshot_06_chatbot.png).
- **Video (optional):** skip for v1.0.0.

## 4. Production release (Release → Production → Create new release)

1. **Signing:** let Google Play manage your signing key (default). Save the
   upload key JKS securely for future updates.
2. **App bundle:** upload the `.aab` produced by **Emergent Publish**
   (top-right corner of Emergent). Do NOT try to build with EAS CLI —
   Emergent handles this for you.
3. **Release name:** `1.0.0 (1)` — auto-populated from versionCode.
4. **Release notes (English US):**
   ```
   Initial release. PLOS — Personal Life Operating System.
   AI-powered dashboard for finance, career, safety, and daily life.
   ```
5. Click **Review release** → check every warning → **Start rollout to Production**.

## 5. Post-submission

- Track review status under **Publishing overview**. First reviews typically
  take 3–7 days.
- Common rejection reasons and how to respond:
  - **Financial services disclosure missing** → confirm the Financial
    Features declaration under 2j is set to Yes with Plaid disclosure.
  - **Sensitive permissions justification** → point reviewer to
    infoPlist NSLocation strings and android.permissions in app.json.
  - **Privacy policy link broken** → confirm GitHub Pages is live at the
    URL above (test in incognito).

## 6. What only you can do (blockers for me, the AI agent)

- [ ] Enable GitHub Pages on `mosesther130-code/plos-personal-life-os`:
      Settings → Pages → Source: `main` branch, `/docs` folder → Save.
- [ ] Push `/app/docs/privacy-policy.html` and `/app/docs/terms-of-service.html`
      to the repository so Pages serves them.
- [ ] Create the `plos.support@gmail.com` Gmail account.
- [ ] Click Emergent's **Publish** button in the top-right to generate the
      Android `.aab` build. (EAS-CLI equivalents are not available in this
      environment.)
- [ ] Register `com.mosesndifon.plos` as an allowed Android package name in
      the Plaid Dashboard before switching PLAID_ENV to `production`.
- [ ] Regenerate `google-services.json` in Firebase Console for the new
      package name (`com.mosesndifon.plos`) and drop it into
      `/app/frontend/google-services.json`.
- [ ] Submit to Play Console following steps 1–5 above.
