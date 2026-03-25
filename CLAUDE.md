# Silent Witness Admin — AI context

This repo is the internal admin dashboard (Next.js, Prisma, multi-tenant).

## gstack

[gstack](https://github.com/garrytan/gstack) is vendored at `.agents/skills/gstack` for Cursor / Claude-style agents that support the SKILL.md standard.

- Use **/browse** from gstack for all web browsing. Do **not** use `mcp__claude-in-chrome__*` tools.
- If gstack skills misbehave or `/browse` fails, install [Bun](https://bun.sh), then from the repo root run:
  - **Git Bash / WSL:** `cd .agents/skills/gstack && ./setup --host codex`  
  - (Builds the browse binary and registers skills for Codex-compatible hosts.)

**Available slash-command skills (from gstack):**

/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /retro, /investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade

See `.agents/skills/gstack/README.md` for full documentation.
