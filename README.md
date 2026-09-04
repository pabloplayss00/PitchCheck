# PitchCheck

A football probability calculator: pick a competition, pick a real match, and see modelled
odds across every major market — 1X2, double chance, handicaps, goal lines, BTTS, correct
score, half-time/full-time, cards, corners, role-based scorer/booking odds, and an
accumulator builder.

It's a plain static site — no build step, no framework, no server required. Three files do
all the work: `data.js` (real teams and real fixtures), `app.js` (the probability model and
all the rendering), and `styles.css`.

## Running it locally

Just open `index.html` in a browser. Because everything is plain `<script>` tags (no
`fetch`, no ES modules), it works straight off the filesystem — no local server needed.

## What's real and what's modelled

- **Teams and results are real.** Rosters, and the 2026-27 promotions/relegations, for the
  Premier League, La Liga, Serie A, Bundesliga and Ligue 1 are current. Every match in
  `data.js` — results through early September and fixtures beyond that — is a real result
  or a real scheduled fixture, sourced from footballwebpages.co.uk.
- **Ratings are derived, not invented.** Each club's attack/defence strength comes from its
  real 2025-26 final-table goals-for/against per game. Newly promoted clubs (no top-flight
  2025-26 record) get a standard "promoted side" baseline until they build one.
- **The odds themselves are a model**, not a live bookmaker feed: a Poisson goals model over
  those ratings, referee-style and cross-league adjustments layered on top. Treat every
  percentage as an estimate, not a certainty.
- **Champions League / Europa League** are built only from clubs in the five leagues above
  (top 4 per league → Champions League, next 2 → Europa League), with an approximate
  cross-league strength adjustment — not the real UEFA draw.
- **Domestic cups** (FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France) don't
  have real draws yet this early in the season, so those tabs let you pick any two
  top-flight sides from that country instead of pretending a fixture exists.

## Keeping the data current

`data.js` is a snapshot taken on 3 September 2026. Nothing here calls a live API, so the
fixture list will gradually fall behind as the season goes on. To refresh it:

1. Open `data.js` and find the `MATCHES` object.
2. Each league is an array of `[date, home, away, homeGoals, awayGoals, kickoff]` rows.
   Played matches have numeric goals; unplayed ones have `null, null` and a `"HH:MM"`
   kickoff string.
3. Add new results/fixtures (or replace the whole block) from any results site — the team
   names must match the names used in that league's `teams` list earlier in the same file.
4. If a season rolls over, update the `teams` array's `[name, goalsFor, goalsAgainst,
   played]` rows to the new final table, and move the right three teams to `[name, null,
   null, null]` (promoted) as promotions/relegations change.

For odds that update themselves without manual edits, you'd need a real data provider
(e.g. API-Football, Sportmonks) and a small backend to hold the API key and serve fixtures
to the page — a static site can't safely call a paid API directly. That's a bigger step up
from this repo, not a config toggle.

## Deploying

### Push to GitHub

```bash
cd pitchcheck-site
git init
git add .
git commit -m "Initial commit"
gh repo create pitchcheck --public --source=. --push
# or, without the GitHub CLI:
# git remote add origin https://github.com/<you>/pitchcheck.git
# git branch -M main
# git push -u origin main
```

### Deploy on Vercel

This is a static site, so Vercel needs zero configuration:

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo you just
   pushed (Vercel will ask to connect your GitHub account the first time).
2. Leave the framework preset as **Other** and the build command **empty** — there's
   nothing to build.
3. Click **Deploy**. Vercel serves the three files as-is; you'll get a `*.vercel.app` URL
   within a few seconds, and every future push to `main` redeploys automatically.

Alternatively, from the CLI: `npx vercel` inside the project folder, then `npx vercel --prod`
once you're happy with it.

## Project structure

```
pitchcheck-site/
├── index.html    the page structure
├── styles.css    all styling (light + dark mode)
├── data.js       real team ratings + real fixtures/results
├── app.js        the probability model and all rendering logic
└── README.md     this file
```

## Disclaimer

These are statistical estimates, not betting advice. If gambling stops being fun,
BeGambleAware.org offers free, confidential support.
