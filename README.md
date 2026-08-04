# The Human Firewall — Security Awareness Escape Room (CyT-AL3)

## What's inside
- `server.js` — Express backend + a plain JSON file as the database (`data.json`, created automatically on first run — no compiling, no Python required)
- `public/index.html` — the whole front end: login, video briefing, 4-exhibit escape room, pre/post quiz, results + leaderboard
- `package.json` — dependencies (just `express`)

## Run it
```bash
npm install
npm start
```
Then open **http://localhost:3000** in a browser. That's it — one server, one page.

## How the pieces map to your project brief
- **Username from database** → `/api/login` adds (or reuses) an entry in `data.json`'s `users` list. No password — it's an awareness tool, not an account system.
- **Videos before the escape room** → three embedded YouTube clips on the briefing screen (password hygiene, spear phishing, tailgating). They're real placeholder videos so the embeds work immediately — swap the video IDs in `index.html` (`src="https://www.youtube.com/embed/VIDEO_ID"`) for your own recordings whenever you have them.
- **Escape room** → 4 exhibits: password strength, phishing link inspection (hover-to-reveal), data classification, tailgating scenario.
- **Pre/post assessment** → same 5-question quiz before and after the game, scores compared on the results screen (this is your "measure retention" objective — the numbers are the evidence for your results chapter).
- **Leaderboard after the quiz** → ranked by closing (post-test) score first, then fastest completion time as the tiebreaker, top 3 highlighted in gold/silver/bronze. Backed by the `scores` list in `data.json`.

## Extending it
- `data.json` stores every attempt (not just the best), so you can open it in any text editor or import it into Excel/Python for your dissertation's analysis section.
- To add more questions or exhibits, edit the `quiz`, `passwordOptions`, `exhibitsData`, `dataItems`, or `tailgateOptions` arrays near the top of the `<script>` in `index.html`.
- If a marker specifically wants to see a real SQL database rather than a JSON file, the `data.json` shape (`users: [...]`, `scores: [...]`) maps directly onto two tables — `users(username, created_at)` and `scores(username, pre_score, post_score, time_seconds, created_at)` — worth mentioning in your report as the intended production design even if this build uses a flat file for simplicity.
- To deploy somewhere other than localhost, host `server.js` on any Node-capable host (Render, Railway, a university VM) — no code changes needed, just `npm install && npm start` there too.
