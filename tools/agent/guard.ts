/**
 * What the agent commands refuse (GATE-018). The app's GitHub permissions already rule out
 * rulesets, branch protection and workflows; these cover what its permissions would allow but
 * Ian keeps for himself: merging, labels, and rewriting history.
 */

/** Why `gh <args>` is refused for the agent, or null if it's allowed. */
export function refuseGh(args: string[]): string | null {
  const [cmd, sub] = args;
  const has = (...flags: string[]) => args.some((a) => flags.some((f) => a === f || a.startsWith(`${f}=`)));
  if (cmd === "pr" && sub === "merge") return "agents never merge; Ian approves and merges (GATE-014)";
  if ((cmd === "pr" || cmd === "issue") && sub === "edit" && has("--add-label", "--remove-label")) {
    return "agents don't add or remove labels; Ian does";
  }
  if (cmd === "pr" && sub === "review") return "agents don't review pull requests; Ian does";
  if (cmd === "label") return "agents don't manage labels; Ian does";
  if (cmd === "auth" || cmd === "secret" || cmd === "variable" || cmd === "ruleset" || cmd === "workflow") {
    return `agents don't use gh ${cmd}`;
  }
  if (cmd === "repo" && sub !== "view") return `agents don't use gh repo ${sub ?? ""}`.trim();
  if (cmd === "api") {
    const i = args.findIndex((a) => a === "-X" || a === "--method");
    const method = (
      i >= 0 ? args[i + 1] : (args.find((a) => a.startsWith("--method="))?.slice(9) ?? "GET")
    ).toUpperCase();
    const writes = has("-f", "-F", "--field", "--raw-field", "--input");
    if (method !== "GET" || writes) return "agents only read through gh api; use the gh commands for pull requests";
  }
  return null;
}

/** Why pushing `branch` is refused, or null if it's allowed. Only plain pushes of a feature branch. */
export function refusePush(branch: string, extra: string[] = []): string | null {
  if (!branch || branch === "HEAD") return "check out a feature branch first";
  if (["main", "master", "gh-pages"].includes(branch)) return `agents never push to ${branch}; open a pull request`;
  if (!/^[\w.\-/]+$/.test(branch) || branch.startsWith("-")) return `not a plain branch name: ${branch}`;
  if (extra.length)
    return `agent:push takes no options (got ${extra.join(" ")}); force pushes and deletes aren't allowed`;
  return null;
}
