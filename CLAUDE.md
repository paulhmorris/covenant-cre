# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Marketing/lead-gen site for Covenant Commercial Real Estate (Rockwall, TX), built with Astro and deployed to Cloudflare Workers.

## Commands

```bash
npm run dev       # astro dev server
npm run build     # astro build -> dist/
npm run preview   # astro preview
npm run deploy    # astro build && wrangler deploy
npm run ngrok     # expose local dev server via ngrok (fixed domain)
```

No test suite or linter is configured. Formatting is via Prettier (`.prettierrc.mjs`, with `prettier-plugin-astro` and `prettier-plugin-tailwindcss`) — run `npx prettier --write .` if asked to format.

## Architecture

- **Astro** with the `@astrojs/cloudflare` adapter (`imageService: "compile"`). Output is a Cloudflare Worker (`dist/_worker.js/index.js`), deployed via `wrangler.jsonc` (worker name `covenant-cre`).
- Pages live in `src/pages/*.astro` (currently `index.astro`, `listings.astro`); each wraps content in `src/layouts/Layout.astro`, which sets up `<head>` (meta/OG tags, favicons, Umami analytics via `src/components/Analytics.astro`), global fonts/CSS imports, and a scroll-reveal animation using `motion`.
- Scroll-reveal pattern: any element with `data-animate` (optionally `data-delay="0.1"`) fades/slides in via an `IntersectionObserver` set up once in `Layout.astro`. Reuse this attribute rather than writing new animation code for on-scroll reveals.
- Components in `src/components/` are page sections composed by `index.astro` (`Hero`, `Services`, `Team`, `ContactForm`), plus shared chrome (`Header`, `Footer`, `ContentWrapper` for consistent max-width/padding).
- Styling is Tailwind v4 (via `@tailwindcss/vite`, no config file — theme customization happens in `src/global.css` `@theme` block: `--color-brand-blue`, `--color-brand-gold`, `--color-success`, `--color-danger`, and font stacks for Fraunces/Inter). Base-layer overrides in `global.css` style form inputs/checkboxes/labels globally — don't re-style these per-component.
- Icons: `astro-icon` with the `tabler` iconify set, plus Shoelace icon assets copied in via `viteStaticCopy` (aliased at `/assets/icons/*` in `astro.config.mjs`).
- `ContactForm.astro` posts form data (JSON) to `PUBLIC_FORM_ENDPOINT` (an external Fly.io form handler), gated by a Cloudflare Turnstile widget (`PUBLIC_CF_TURNSTILE_SITE_KEY`). Both vars are defined in `wrangler.jsonc` `vars` for production and in `.env.local`/`.env.production` for local/build use.
- `listings.astro` embeds an external LoopNet iframe rather than a custom listings implementation.
