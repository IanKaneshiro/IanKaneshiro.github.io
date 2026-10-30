@AGENTS.md

## Claude Code specifics

- **The gate is enforced.** A Stop hook (`.claude/hooks/gate.sh`) runs `bun run gate` whenever
  this session changed code, and keeps you working while it fails, up to 3 attempts. Then it
  hands over to Ian. Don't stop with a red gate and explain later; fix it, or say clearly why you can't.
- **The limits are permission rules.** `.claude/settings.json` denies merging, labeling, pushing
  to main, force pushing, changing protection and editing `.claude/`. Don't look for another way
  to do any of them.
