# ClockClock — Self-Hosted Time Tracker

[![Docker Image Version](https://img.shields.io/docker/v/argonqq/clockclock/latest?label=docker%20hub)](https://hub.docker.com/r/argonqq/clockclock)
[![GitHub Tag](https://img.shields.io/github/v/tag/ArgonQQ/ClockClock)](https://github.com/ArgonQQ/ClockClock/tags)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Open source time tracking for freelancers, agencies, and small teams — self-hosted, Docker-ready, no subscriptions.**

ClockClock is a lightweight self-hosted time tracking app that lets you log billable hours against clients, generate reports, and export timesheets — all from a clean web UI running entirely on your own infrastructure. No cloud accounts, no per-seat pricing, no data leaving your server.

---

## Screenshots

<table>
  <tr>
    <td align="center" width="33%">
      <img src="img/login.png" width="260" alt="ClockClock login screen"/><br/>
      <b>Login</b><br/>
      <sub>Clean login screen with EN/DE language switcher. Supports local auth and OIDC/SSO. Login attempts are rate-limited.</sub>
    </td>
    <td align="center" width="33%">
      <img src="img/tracker.png" width="260" alt="ClockClock time tracker"/><br/>
      <b>Tracker</b><br/>
      <sub>Main timer view. Assign a customer, add a description, and start tracking. Timer survives page reloads via local storage. Includes a picture-in-picture mini window and optional desktop notifications.</sub>
    </td>
    <td align="center" width="33%">
      <img src="img/entries.png" width="260" alt="ClockClock time entries log"/><br/>
      <b>Entries</b><br/>
      <sub>Full log of all time entries. Filter by customer, date range, or user. Admins see everyone's entries; users see only their own. Export to CSV or add entries manually.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <img src="img/reports.png" width="260" alt="ClockClock time reports"/><br/>
      <b>Reports</b><br/>
      <sub>Aggregated summary showing total entries, minutes, and hours with a per-customer breakdown. Apply the same filters as Entries and export the result as a PDF.</sub>
    </td>
    <td align="center" width="33%">
      <img src="img/customers.png" width="260" alt="ClockClock customer management"/><br/>
      <b>Customers</b><br/>
      <sub>Manage your client list with full contact details (name, email, phone, address, notes). Each user manages their own customers; admins can view and edit across the whole team.</sub>
    </td>
    <td align="center" width="33%">
      <img src="img/users.png" width="260" alt="ClockClock user management"/><br/>
      <b>Users <i>(admin only)</i></b><br/>
      <sub>Create and manage team members, assign admin or user roles, and reset passwords. Regular users cannot access this panel.</sub>
    </td>
  </tr>
</table>

---

## Why ClockClock?

Most time tracking tools are SaaS with monthly fees, data stored on someone else's servers, and features you'll never use. ClockClock is the opposite — a single Docker container, a single SQLite file, and everything you actually need to track billable hours and invoice clients.

- **No subscription** — run it yourself, own your data
- **No setup complexity** — one `docker run` command and you're live
- **No bloat** — under 3,000 lines of code, zero frontend frameworks

---

## Features

- **Live timer** — start, pause, resume, with picture-in-picture mini window and desktop notifications
- **Billable hours tracking** — log time entries against customers with descriptions and time ranges
- **Timesheet reports** — per-customer breakdowns with CSV and PDF export
- **Client management** — full contact details, notes, per-user data isolation
- **Multi-user support** — role-based access control (admin and user roles)
- **SSO / OIDC** — integrate with Keycloak, Authentik, Azure AD, or any OIDC provider
- **English & German** — language switcher with no page reload
- **Three themes** — Dark, Light, and Terminal; toggle with the header button or pick from the Account modal; mini timer window follows the active theme live
- **Account management** — users can change their email address and password from within the app
- **Password reset** — forgot-password flow sends a one-time reset link via email (requires SMTP configuration)
- **Self-contained** — SQLite database; no external services required unless email is enabled

---

## Quick Start

### Docker

```bash
docker run -d \
  --name clockclock \
  -p 3000:3000 \
  -v clockclock-data:/app/data \
  -e ADMIN_PASSWORD=changeme \
  argonqq/clockclock:latest
```

Open [http://localhost:3000](http://localhost:3000) and log in with `admin` / `changeme`.

The `/app/data` volume holds the SQLite database. Your data survives container restarts and image upgrades as long as the volume persists.

> **First run:** If `ADMIN_PASSWORD` is not set, a random password is generated and printed to the container logs (`docker logs clockclock`).

### Docker Compose

```yaml
services:
  clockclock:
    image: argonqq/clockclock:latest
    ports:
      - "3000:3000"
    volumes:
      - clockclock-data:/app/data
    environment:
      SESSION_SECRET: change-me-to-a-long-random-string
      ADMIN_PASSWORD: changeme
    restart: unless-stopped

volumes:
  clockclock-data:
```

### Manual (Node.js)

```bash
git clone https://github.com/ArgonQQ/ClockClock.git
cd ClockClock
cp .env.example .env   # edit as needed
npm install
node server.js
```

---

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` to get started.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port to listen on |
| `SESSION_SECRET` | *(random)* | Secret used to sign session cookies — set this in production |
| `DB_PATH` | `data/timetracker.db` | Path to the SQLite database file |
| `AUTH_MODE` | `local` | Authentication mode: `local` or `oidc` |
| `ADMIN_USER` | `admin` | Username of the default admin account |
| `ADMIN_PASSWORD` | *(generated)* | Password for the default admin — printed to stdout on first run if not set |
| `APP_BASE_URL` | `http://localhost:PORT` | Public base URL used in password-reset email links |
| `SMTP_HOST` | *(unset)* | SMTP server hostname — password reset emails are disabled when unset |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | Set to `true` for TLS (port 465) |
| `SMTP_USER` | *(unset)* | SMTP username |
| `SMTP_PASS` | *(unset)* | SMTP password |
| `SMTP_FROM` | `ClockClock <noreply@example.com>` | From address on outgoing emails |
| `RESET_TOKEN_TTL_MIN` | `60` | Password-reset link lifetime in minutes |

### OIDC / SSO

Set `AUTH_MODE=oidc` to enable single sign-on. Compatible with Keycloak, Authentik, Azure AD, and any standard OIDC provider.

| Variable | Description |
|---|---|
| `OIDC_ISSUER` | Issuer URL of your identity provider |
| `OIDC_CLIENT_ID` | Client ID registered with the IdP |
| `OIDC_CLIENT_SECRET` | Client secret |
| `OIDC_REDIRECT_URI` | Callback URL (e.g. `https://clock.example.com/auth/oidc/callback`) |
| `OIDC_SCOPES` | Scopes to request (default: `openid profile email groups`) |
| `OIDC_GROUPS_CLAIM` | JWT claim that contains group membership (default: `groups`) |
| `OIDC_ADMIN_GROUP` | Group name whose members receive the admin role |

---

## Development & Testing

### Running the test suite

`test.sh` is a shell-based integration test suite that verifies authentication, authorization, and data isolation against a live server. It requires only `curl` and `sh`.

```bash
# Run against the local server (make sure it's running first)
./test.sh

# Run against a remote server
./test.sh http://your-server:3000
```

The suite covers:

- **Auth** — rejects bad passwords, validates sessions, blocks unauthenticated requests
- **User management** — regular users cannot access the user list or manage other accounts
- **Customer isolation** — users can only see and edit their own customers; admins can see all
- **Entry isolation** — users can only see and edit their own entries; admins can see all
- **Referential integrity** — customers with associated entries cannot be deleted
- **Password & email changes** — users can update their own credentials; old sessions are invalidated
- **Password policy** — enforces minimum length and blocks passwords matching the username

```
ClockClock Test Suite
Base: http://localhost:3000

Auth
  ✓ reject bad password
  ✓ admin login succeeds
  ✓ admin session valid
  ✓ unauthenticated rejected
...
────────────────────────────
  Passed: 22  Failed: 0  Total: 22
────────────────────────────
```

### Seeding demo data

Populate the app with realistic demo data (3 users, 6 customers, 28 time entries) for local development or a live demo:

```bash
ADMIN_PASSWORD=changeme ./test.sh seed

# Against a remote server
ADMIN_PASSWORD=changeme ./test.sh seed http://your-server:3000
```

This creates three users with pre-loaded time entries across six clients:

| User | Password | Clients |
|---|---|---|
| `admin` | *(your ADMIN_PASSWORD)* | Hofmann Metallbau GmbH, Lindgren & Partners |
| `sarah.mueller` | `sarah2026secure` | Café Morgenrot, Dr. Petersen Zahnarztpraxis |
| `tom.brenner` | `tom2026secure` | Vinotek GmbH, Nowak Transport Sp. z o.o. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Database | SQLite via `better-sqlite3` |
| Frontend | Vanilla JavaScript, HTML, CSS — no build step |
| Auth | Scrypt password hashing, server-side sessions, OIDC |
| Email | Nodemailer (optional SMTP — only needed for password reset) |
| Container | Docker, multi-arch (linux/amd64, linux/arm64) |

---

## License

MIT
