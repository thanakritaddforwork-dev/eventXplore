# 7. Auth, RBAC & security

[← Back to overview](../README.md)

## Self-hosted authentication

- Backoffice accounts live in PostgreSQL (`admin_accounts`), passwords hashed with **scrypt** + per-user salt, compared with `timingSafeEqual`.
- **Three independent session cookies**, each path-scoped: `/admin` (Owner), `/salesman`, `/staff`. `proxy.ts` reads only the cookie that belongs to the path, so one browser can hold an Owner and a Staff session without them leaking into each other.
- Invite → activation link → set password; password reset by email; staff recovery by OTP.
- Visitors use passwordless **email OTP** (`visitor_login_challenges`).
- History: started on Supabase Cloud Auth, moved to self-hosted GoTrue, then to a Postgres-native session system once the free-tier pause made Cloud auth unsuitable for production.

## RBAC

| Role | Scope |
|---|---|
| `business_owner` | all 29 permissions |
| `salesman` | operational dashboard, exhibitors (read), sales (read/write) |
| `ticket_checker` | operational dashboard, visitors/exhibitors/booths (read), check-in, add-on redemption |
| `user` | public customer |

- Role is always read from the account row, never from a form field (a real bug of this kind was found and fixed: the login page's hidden `loginContext` decided which cookie was written).
- `requireAdmin(permission, redirectTo, scope)` guards every page and Server Action; hiding a button is never the permission check.

## Defence in depth

- **Never trust the client**: event IDs, booth IDs, prices, totals, statuses and permissions are re-resolved server-side in every action.
- **Capability tokens** (256-bit) for public payment sessions and slip upload, not sequential IDs.
- **Rate limiting** on OTP, ticket resend, slip upload and status polling; origin check on public POST routes; **Cloudflare Turnstile** on public forms.
- Upload limits by file size and pixel count.
- Public payloads exclude Tax ID, payment tokens, private notes and internal audit data; Tax IDs are masked to the last 4 digits in admin views.
- DB-level guards (triggers) duplicate the most important state machines so even raw SQL cannot move a paid order backwards.
- PDPA: explicit consent capture, marketing consent stored separately, privacy policy & terms versioned (TH/EN).
