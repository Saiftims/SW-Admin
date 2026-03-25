# gstack in this repo

This project includes **[gstack](https://github.com/garrytan/gstack)** (Garry Tan’s Claude Code skill stack) under:

`.agents/skills/gstack`

Cursor and other agents that support **SKILL.md** can discover skills from that folder.

## One-time setup (build + register)

The `setup` script needs **[Bun](https://bun.sh)**.

1. Install Bun: https://bun.sh/docs/installation  
2. From **Git Bash** or **WSL** (recommended on Windows):

```bash
cd .agents/skills/gstack
./setup --host codex
```

Use `--host auto` to detect installed agents, or `--host claude` if you only use Claude Code.

3. If you update gstack later:

```bash
cd .agents/skills/gstack
git pull
./setup --host codex
```

Project-level instructions for the AI are in the root **`CLAUDE.md`** (gstack section).
