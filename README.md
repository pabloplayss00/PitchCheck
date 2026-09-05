# PitchCheck

A football probability calculator, as a real multi-page site: browse fixtures on the
**hub** (`index.html`), click any match to open its own **match page**
(`match.html?comp=...`) with the full report and every market — 1X2, double chance,
handicaps, goal lines, BTTS, correct score, half-time/full-time, cards, corners, shots on
target, goalkeeper saves, and a real-squad Player Watch (score/assist/shots/booked/
fouls/fouled/saves per real player). Every value shown is itself an accumulator control —
tap any row, tile or table cell across Every Market to add or remove that leg, no separate
picker required. Legs you add on one match's page follow you to any other match and back
to the hub, via a persistent slip bar.

It's a plain static site — no build step, no framework, no real server required for the
pages themselves. The files:

- `data.js` — real teams, fixtures, squads and referees (the raw data)
- `engine.js` — the Poisson probability model and all market math, shared by both pages
- `acca.js` — the shared bet-slip state (stored in the browser via `localStorage` so it
  survives navigating between pages) and the slip widget both pages render
- `index.html` / `index.js` — the fixtures & competitions hub
- `match.html` / `match.js` — a single match's full odds page
- `styles.css` — all styling (one committed dark theme)

## Running it locally

Open `index.html` in a browser and click through — because everything is plain
`<script>` tags (no `fetch`, no ES modules) and navigation between pages is plain links
and `location.href`, it works straight off the filesystem, no local server needed.
The one caveat is the shared bet slip: it's stored with `localStorage`, which works from
`file://` in most browsers but is more consistently reliable once the site is actually
served over `http(s)` — which is exactly what happens once you deploy it (see below), so
this only really matters for local testing.

## What's real and what's modelled

- **Teams and results are real.** Rosters, and the 2026-27 promotions/relegations, for the
  Premier League, La Liga, Serie A, Bundesliga and Ligue 1 are current. Every match in
  `data.js` — results through early September and fixtures beyond that — is a real result
  or a real scheduled fixture, sourced from footballwebpages.co.uk.
- **Ratings are derived, not invented, and now move with current form.** Each club's
  attack/defence strength starts from its real 2025-26 final-table goals-for/against per
  game (newly promoted clubs, with no top-flight 2025-26 record, start from a standard
  "promoted side" baseline instead). From there it blends in that club's actual goals for/
  against over its last 6 played 2026-27 matches, weighted so the season-long baseline
  still counts for more until a real run of current-season results builds up — see
  `FORM_WINDOW`/`FORM_PRIOR_GAMES` in `engine.js`. A club on a hot or cold streak, or a
  promoted side that's over- or under-performing its generic baseline, sees its rating
  (and every market built on it) shift accordingly as `data.js` is refreshed with results.
- **The odds themselves are a model**, not a live bookmaker feed: a Poisson goals model over
  those ratings, referee-style and cross-league adjustments layered on top. Treat every
  percentage as an estimate, not a certainty.
- **Champions League / Europa League** are built only from clubs in the five leagues above
  (top 4 per league → Champions League, next 2 → Europa League), with an approximate
  cross-league strength adjustment — not the real UEFA draw.
- **Domestic cups** (FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France) don't
  have real draws yet this early in the season, so those tabs let you pick any two
  top-flight sides from that country instead of pretending a fixture exists.
- **Player Watch uses each club's real current squad** (real names, real positions),
  researched club by club. What's modelled is the *split*: a team's total expected goals
  and cards for the match is divided across that real squad by position and by how
  prominent each player is listed (its main striker gets a bigger slice of the goal
  total than a rotation option) — it isn't drawn from that individual's own scoring or
  disciplinary record, so treat a player's percentage as "how the model spreads this
  team's total across its squad," not a licensed player-prop figure.
- **Referees are real, currently-active officials** for each league, each with a sourced
  cards-per-game figure (yellow+red, from recent officiating records) turned into a
  multiplier against that league's own referee-pool average. Champions League / Europa
  League ties fall back to a generic Lenient/Average/Strict style picker, since there's
  no single real UEFA panel to draw from.
- **Shots on target, corners, fouls and saves are modelled the same way as goals and
  cards** — from each team's derived attacking/disciplinary rating, not from an official
  match report. Corners and shots on target get their own per-team lines (not just a
  combined total); goalkeeper saves are derived from the *opponent's* shots-on-target
  total minus their expected goals, so a busier defence means a busier keeper. Player-level
  assists, fouls and "to be fouled" follow the same position-and-prominence split as the
  scoring/booking figures.

## Keeping the data current

`data.js` is a snapshot taken on 3 September 2026. Nothing here calls a live API, so the
fixture list, squads and referee appointments will gradually fall behind as the season
goes on. To refresh it:

1. **Fixtures/results** — open the `MATCHES` object. Each league is an array of
   `[date, home, away, homeGoals, awayGoals, kickoff]` rows. Played matches have numeric
   goals; unplayed ones have `null, null` and a `"HH:MM"` kickoff string. Add new
   results/fixtures (or replace the whole block) from any results site — team names must
   match the names used in that league's `teams` list earlier in the same file. This isn't
   just cosmetic: every team's rating now blends in its last 6 played matches here (see
   "Ratings are derived, not invented" above), so keeping this array current is what makes
   ratings actually track current form rather than only last season's table.
2. **League table / promotions** — if a season rolls over, update the `teams` array's
   `[name, goalsFor, goalsAgainst, played]` rows to the new final table, and move the
   right three teams to `[name, null, null, null]` (promoted) as promotions/relegations
   change.
3. **Squads** — open the `ROSTERS` object. Each club is `"Club Name": [[player, position], ...]`
   with position one of `GK`/`DEF`/`MID`/`FWD`. Update entries as transfers, injuries or
   suspensions change who's actually playing; the player listed first within a position
   gets a slightly larger share of that position's goal/assist/shot/card/foul total
   (Player Watch on the match page), so put the club's most-used name at that position
   first.
4. **Referees** — open the `REFEREES_BY_LEAGUE` object. Each league is a list of
   `{ name, cpg, mult, tendency }` entries; `cpg` is the sourced cards-per-game figure and
   `mult` is `cpg` divided by that league's own pool average (recompute it if you add or
   remove officials from the list, so the pool average — and everyone's `mult` — stays
   consistent).

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
3. Click **Deploy**. Vercel serves the files as-is; you'll get a `*.vercel.app` URL
   within a few seconds, `index.html` and `match.html` both resolve automatically as
   top-level pages, and every future push to `main` redeploys automatically.

Alternatively, from the CLI: `npx vercel` inside the project folder, then `npx vercel --prod`
once you're happy with it. GitHub Pages works the same way — it's a static multi-page
site, nothing Vercel-specific about it.

## Project structure

```
pitchcheck-site/
├── index.html    fixtures & competitions hub
├── index.js      hub rendering logic
├── match.html    single-match odds page
├── match.js      match-page rendering logic
├── engine.js     shared probability model + market math (used by both pages)
├── acca.js       shared bet-slip state (localStorage) + the slip widget
├── styles.css    all styling (one committed dark theme)
├── data.js       real teams, fixtures, squads and referees
└── README.md     this file
```

## Disclaimer

These are statistical estimates, not betting advice. If gambling stops being fun,
BeGambleAware.org offers free, confidential support.
