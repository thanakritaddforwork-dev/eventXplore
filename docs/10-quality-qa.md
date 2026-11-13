# 10. Quality & QA process

[← Back to overview](../README.md)

## Automated

- **178 test files, ~1,600 test cases** (Vitest): pricing, VAT, money, payment transitions, PromptPay payload, Tax ID, slip analysis, permissions, session scopes, hall layout services, check-in, sales repository, email templates, i18n.
- Type check + lint + tests on every pull request.

## Scripted manual QA

- **768 written test cases** in three suites: public (193), admin (251), operations (324), each with steps, expected result and evidence screenshot ID.
- Full-flow "Deep QA" runs on the deployed environment: create an event, build the hall, publish, register as visitor, book booths as exhibitor, upload a slip, approve as Owner, check in as staff, then verify every dashboard number against the data.
- UI "anti-slop" audits for wording, contrast, broken states, dark mode and mobile, with numbered findings and re-check rounds.
- QA passes are run separately from development: the tester only tests and never edits code.

## Product rules as code review checklist

A single `PROJECT_RULES.md` defines what "done" means, for example:

- Never clear valid input after a validation error; server validates again.
- Publishing an event never silently opens registration, booking or payment.
- Every mutation is audited; draft data never reaches public pages.
- No fake data presented as real; unavailable features are labelled, not hidden or faked.
- No gradients, no decorative emoji, Thai-first plain language.

## Design system

`DESIGN.md` + CSS tokens in `globals.css`: a hall-wayfinding-signage identity (ink boards, booth-code plates, one yellow signal colour), WCAG AA checked light and dark themes, self-hosted Thai/Latin fonts (Bai Jamjuree, Anuphan; Space Grotesk + Noto Sans Thai for the Coff&Mat Fest public brand), and a per-brand token override so one codebase can wear an event's own look on the public site.
