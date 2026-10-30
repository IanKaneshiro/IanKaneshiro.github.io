@AGENTS.md

## Claude Code specifics

- **The gate is enforced.** A Stop hook (`.claude/hooks/gate.sh`) runs `bun run gate` whenever
  this session changed code, and keeps you working while it fails, up to 3 attempts. Then it
  hands over to Ian. Don't stop with a red gate and explain later; fix it, or say clearly why you can't.
- **You are ians-agent[bot].** `.claude/settings.json` sets your git author to the bot, and denies
  plain `git push` and `gh` writes, which would act as Ian. Use `bun run agent:push` and
  `bun run agent:gh -- ...`. It also denies merging, labeling, changing protection, reading the
  app's key and editing `.claude/`. Don't look for another way to do any of them.
- **Opening a pull request:** use the `pr` skill.
