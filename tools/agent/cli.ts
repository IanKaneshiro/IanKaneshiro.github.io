import path from "node:path";
import { APP, botEmail, botName, installationToken } from "./app";
import fs from "node:fs";
import { parsePrEdit, refuseGh, refusePush } from "./guard";

/**
 * The agent commands. Everything they do on GitHub is done as ians-agent[bot] (GATE-018).
 *
 *   bun run agent:token                 print a token (for tools that need one)
 *   bun run agent:gh -- <gh args>       run gh as the agent, e.g. -- pr create --fill
 *   bun run agent:push                  push the current branch as the agent
 */

const root = path.resolve(import.meta.dir, "../..");
const [command, ...args] = process.argv.slice(2);
const run = (cmd: string[], env: Record<string, string> = {}) =>
  Bun.spawnSync(cmd, { cwd: root, env: { ...process.env, ...env }, stdio: ["inherit", "inherit", "inherit"] })
    .exitCode ?? 1;
const fail = (msg: string) => {
  console.error(`agent: ${msg}`);
  process.exit(1);
};
const currentBranch = () => Bun.spawnSync(["git", "branch", "--show-current"], { cwd: root }).stdout.toString().trim();

if (command === "token") {
  console.log((await installationToken()).token);
} else if (command === "gh") {
  const gh = args[0] === "--" ? args.slice(1) : args;
  const refused = refuseGh(gh);
  if (refused) fail(refused);
  if (gh[0] === "pr" && gh[1] === "create" && !gh.includes("--head")) gh.push("--head", currentBranch());
  const { token } = await installationToken();
  const edit = parsePrEdit(gh);
  if (edit) {
    const body = {
      ...(edit.title !== undefined && { title: edit.title }),
      ...(edit.bodyFile !== undefined && { body: fs.readFileSync(edit.bodyFile, "utf8") }),
    };
    const res = await fetch(`https://api.github.com/repos/${APP.repo}/pulls/${edit.number}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) fail(`couldn't edit #${edit.number}: ${res.status} ${await res.text()}`);
    console.log(((await res.json()) as { html_url: string }).html_url);
    process.exit(0);
  }
  process.exit(run(["gh", ...gh], { GH_TOKEN: token, GH_REPO: APP.repo }));
} else if (command === "push") {
  const branch = currentBranch();
  const refused = refusePush(branch, args);
  if (refused) fail(refused);
  const { token } = await installationToken();
  const helper = '!f() { echo username=x-access-token; echo "password=$IAN_AGENT_TOKEN"; }; f';
  process.exit(
    run(
      [
        "git",
        "-c",
        "credential.helper=",
        "-c",
        `credential.helper=${helper}`,
        "push",
        `https://github.com/${APP.repo}.git`,
        `HEAD:refs/heads/${branch}`,
      ],
      { IAN_AGENT_TOKEN: token },
    ),
  );
} else if (command === "whoami") {
  console.log(`${botName()} <${botEmail()}> · app ${APP.appId} · ${APP.repo}`);
} else {
  fail("usage: bun tools/agent/cli.ts <token | gh -- <args> | push | whoami>");
}
