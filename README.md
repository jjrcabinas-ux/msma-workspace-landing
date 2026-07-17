# MSMA Workspace — Landing Page

Marketing/landing page for **MSMA Workspace**, the unified internal platform of
Mora Sanchez Meñoza & Associates (Philippine CPA firm). Live at
[msma.work](https://msma.work) (`www.msma.work` redirects to the apex).

The workspace will eventually merge the firm's existing tools — the
[tax.msma.work](https://tax.msma.work) BIR compliance tracker, Audit Monitoring,
and MSMA Books — plus a new employee task-monitoring module into one app at
`app.msma.work`.

## Architecture

- **Single file:** `index.html`. No build step, no framework, no external JS.
  Inline CSS/JS, Google Fonts via CDN. This is the firm's standard architecture
  across all tools.
- **Hosting:** Firebase Hosting (project `msma-workspace`), same platform as
  tax.msma.work. Deploy with `firebase deploy --only hosting`. DNS is at
  GoDaddy; apex `msma.work` + `www` redirect are configured as custom domains
  in the Firebase console.
- **Style:** Cobalt (joincobalt.com) presentation style — centered hero, glowing
  dashboard mock, bento feature grid, AI assistant section, closing CTA, and a
  two-layer animated particle star field in the hero.

## Guardrails — do not change

The design is **final and approved**. In particular:

1. **Particle tuning values are hand-tuned — do not modify.**
   - Back layer: `rMin:0.5, rVar:1.2, vMin:0.09, vVar:0.28, aMin:0.3, aVar:0.45, density:9000, max:140`
   - Front layer: `rMin:0.9, rVar:1.3, vMin:0.17, vVar:0.33, aMin:0.22, aVar:0.35, density:42000, max:26`
   - Fade zones: `FADE_START:0.38, FADE_END:0.06, BIRTH_ZONE:0.88`
2. **No copy, section-order, color, or font changes.**
3. **No build step, framework, or external JS** — this stays a single HTML file.
4. **Keep the reduced-motion fallback** (static star field under
   `prefers-reduced-motion: reduce`).
5. **`#stars` and `#stars-front` must keep explicit `width:100%`.** Without it
   the hero canvas collapses to ~300px on the left (past bug — do not regress).
6. **The two `.shot-frame` dashboard-mock markup blocks double as the visual
   spec for the future app shell** — leave them intact.
7. **CTA links point to `https://app.msma.work`**, which does not exist yet.
   Leave the links as-is; do not stub or redirect them.

## Out of scope (future phases)

- App shell at `app.msma.work` (module registry, hash routing)
- Server-side auth via Vercel `/api` serverless function
- Migration of tax.msma.work, Audit Monitoring, and Books into the workspace
- The MSMA Assistant AI widget
