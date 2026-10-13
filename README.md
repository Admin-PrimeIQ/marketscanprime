# market-scan-back-office

Web back office for commercial operations and real-estate inventory (**market scan**): manage projects, blocks, units, exchange rates, and catalogs, backed by **Strapi** over HTTP APIs.

**Production:** [https://admin.primeiqlatam.com](https://admin.primeiqlatam.com)

## Contact

For questions about this codebase or repository (**consultas**), contact **Kike Rios**:

- General: [kike@devroot.studio](mailto:kike@devroot.studio)
- GitHub (account / commits correspondence): [web.lrios@gmail.com](mailto:web.lrios@gmail.com)

## Goals

Provide a single, localized (ES/EN) interface for market data—projects, blocks, units, multi-currency pricing, dimensions, parking, rent, maintenance, absorption, and more—deployable on **Vercel**, while keeping the UI, business formulas, and API persistence aligned.

## What the app does

- **Authentication** (login, register, password recovery) and **profile / settings** (role from API, light/dark theme).
- **Projects**: list, create, edit, clone, and detail views with sectioned forms (general info, location, amenities, services, financing).
- **Blocks**: full CRUD, views and forms aligned with business rules (market on block, collection period, unit counts and areas when computed server-side).
- **Units**: per-block **datasheet** table (Glide Data Grid)—bulk edit, undo/redo, type validation, paste, dimension columns in **m²** or **varas²**, pricing in **USD** or other active currencies, derived fields (12% VAT, per m², parking, maintenance, installment/income, absorption), batch save to Strapi, optional block-counter webhook.
- **Exchange-rate profiles** and a **rates sidebar** for currency conversion in the grid.
- **Dynamic catalogs** by route.
- **Dashboard** as the post-login entry point.

## Tech stack

| Area | Technology |
|------|------------|
| Framework | **Next.js** (App Router), **React 19** |
| i18n | **next-intl** (messages in `messages/`) |
| UI | **Tailwind CSS**, **Radix UI**, shadcn-style components, **Lucide** |
| Data | **Strapi** client (`lib/api`), types aligned with OpenAPI |
| Units grid | **@glideapps/glide-data-grid** |
| Forms / validation | **react-hook-form**, **Zod** |
| Analytics | **Vercel Analytics** (optional) |

## Notable implementation details

- **Units grid**: conditional columns (m² *or* varas²; one active currency at a time); local-currency prices editable with two-way conversion vs USD; read-only computed cells; in-memory sync consistent between single-cell and batch edits (`onCellEdited` / `onCellsEdited`).
- **Client-side business formulas** (VAT, net sale/rent prices, maintenance with VAT and net, parking by spaces, totals, absorption, etc.) with header tooltips in EN/ES.
- **App version** read from `package.json` (`lib/constants.ts`).
- **Deployment**: built for **Vercel**; successful deploys depend on the correct GitHub account and commit metadata (see below).

---

## ⚠️ Deployment Notice

Production is served at **[https://admin.primeiqlatam.com](https://admin.primeiqlatam.com)** (Vercel).

Vercel deployments for this project are only accepted from the **`Admin-PrimeIQ`** GitHub account.

Commits pushed from any other GitHub account will **not trigger a successful deployment**.

Make sure your local Git environment is configured to use the correct account before pushing.

---

## Git Multi-Account Setup (macOS)

Follow these steps to configure the Prime IQ GitHub account alongside any existing Git account on your machine.

---

### Step 1 — Check your current Git configuration

Before making any changes, check what is already configured globally on your machine:

```bash
git config --global user.name
git config --global user.email
```

Also check if you already have SSH keys:

```bash
ls -la ~/.ssh
```

Look for files like `id_ed25519`, `id_rsa`, or similar. If any exist, take note of the filenames — you will need them in Step 4 to keep your personal account working.

---

### Step 2 — Generate a new SSH key for the Prime IQ account

```bash
ssh-keygen -t ed25519 -C "engteam@primeiqlatam.com" -f ~/.ssh/id_primeiq
```

When prompted for a passphrase, you can press Enter to skip or set one for extra security.

This creates two files:
- `~/.ssh/id_primeiq` — private key (never share this)
- `~/.ssh/id_primeiq.pub` — public key (this goes into GitHub)

---

### Step 3 — Add the key to the SSH agent

```bash
eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain ~/.ssh/id_primeiq
```

> If `--apple-use-keychain` throws an error, use `ssh-add ~/.ssh/id_primeiq` instead.

---

### Step 4 — Configure `~/.ssh/config`

Check if the file already exists and what is in it:

```bash
cat ~/.ssh/config
```

Open it with your editor (it will be created if it does not exist):

```bash
open -e ~/.ssh/config
# or use any editor: nano, vim, cursor, code, etc.
```

Add the Prime IQ block. If you already have a `Host github.com` entry, leave it as-is and just append the new block below it. If the file is empty, add both blocks:

```
# Your existing personal GitHub account
# Replace id_ed25519 with the filename you found in Step 1
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519

# Prime IQ GitHub account
Host github-primeiq
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_primeiq
```

> The `Host github-primeiq` alias is what allows Git to use a different SSH key for this repo without affecting your personal account.

---

### Step 5 — Add the public key to the Admin-PrimeIQ GitHub account

Copy the public key:

```bash
cat ~/.ssh/id_primeiq.pub
```

Then:

1. Log in to GitHub as `Admin-PrimeIQ`
2. Go to **Settings → SSH and GPG keys → New SSH key**
3. Give it a recognizable title (e.g. your name or machine name)
4. Paste the key and save

---

### Step 6 — Test the SSH connection

```bash
ssh -T git@github-primeiq
```

Expected response:

```
Hi Admin-PrimeIQ! You've successfully authenticated, but GitHub does not provide shell access.
```

If you see a `Permission denied` error, double-check that the public key was saved correctly in Step 5.

---

### Step 7 — Clone or update the remote URL

**If you are cloning the repo for the first time:**

```bash
git clone git@github-primeiq:Admin-PrimeIQ/market-scan-back-office.git
```

**If you already have the repo cloned**, update the remote URL:

```bash
git remote set-url origin git@github-primeiq:Admin-PrimeIQ/market-scan-back-office.git
```

Verify:

```bash
git remote -v
```

Expected output:

```
origin  git@github-primeiq:Admin-PrimeIQ/market-scan-back-office.git (fetch)
origin  git@github-primeiq:Admin-PrimeIQ/market-scan-back-office.git (push)
```

---

### Step 8 — Set the Git user for this repo only

Inside the project folder, run:

```bash
git config user.name "Your Name"
git config user.email "engteam@primeiqlatam.com"
```

Replace `"Your Name"` with your actual name. This overrides the global Git config **only for this repository** and ensures commits are authored with the correct email for Vercel to accept the deployment.

Verify it was applied:

```bash
git config user.name
git config user.email
```

---

### Step 9 — Push

```bash
git push origin main
```

Vercel will detect the push from `Admin-PrimeIQ` and trigger the deployment automatically.

---

## Troubleshooting

**SSH connection fails (`Permission denied`)**
- Make sure the public key from `~/.ssh/id_primeiq.pub` is added to the `Admin-PrimeIQ` GitHub account
- Run `ssh-add ~/.ssh/id_primeiq` and try again

**Wrong user is pushing**
- Run `git config user.email` inside the repo to confirm the local config is set
- Run `ssh -T git@github-primeiq` to confirm the SSH key maps to the right account

**Deployment still fails after push**
- Check that your commit email matches what Vercel expects
- Run `git log --format="%ae" -5` to see the email on your last 5 commits

---

## Quick Reference

| Config | Value |
|--------|-------|
| Production URL | [https://admin.primeiqlatam.com](https://admin.primeiqlatam.com) |
| Maintainer / consultas | Kike Rios — [kike@devroot.studio](mailto:kike@devroot.studio) |
| GitHub (personal email) | [web.lrios@gmail.com](mailto:web.lrios@gmail.com) |
| GitHub account | `Admin-PrimeIQ` |
| Email for commits | `engteam@primeiqlatam.com` |
| SSH host alias | `github-primeiq` |
| SSH key | `~/.ssh/id_primeiq` |
| Remote URL | `git@github-primeiq:Admin-PrimeIQ/market-scan-back-office.git` |