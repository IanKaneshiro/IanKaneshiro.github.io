import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Failure } from "../gate/types";

/**
 * The agent's own GitHub identity (GATE-018): the private GitHub App ians-agent, acting as
 * ians-agent[bot]. Tokens are minted from the app's private key, last at most an hour, and are
 * limited to this repository. The key lives outside the repo, in ~/.config/ian-agent/.
 */

export type AppConfig = { appId: number; slug: string; botUserId: number; repo: string };
export const APP: AppConfig = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "app.json"), "utf8"));

export const CONFIG_DIR = process.env.IAN_AGENT_DIR ?? path.join(os.homedir(), ".config/ian-agent");
export const KEY_FILE = path.join(CONFIG_DIR, "private-key.pem");
const TOKEN_FILE = path.join(CONFIG_DIR, "token.json");

export const botName = (app = APP) => `${app.slug}[bot]`;
export const botEmail = (app = APP) => `${app.botUserId}+${app.slug}[bot]@users.noreply.github.com`;

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/** A JWT that proves we hold the app's key. GitHub accepts at most 10 minutes; this one lasts 9. */
export function appJwt(appId: number, privateKey: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000) - 60;
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iat, exp: iat + 600, iss: String(appId) }));
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);
  return `${head}.${body}.${b64url(sig)}`;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Options = { app?: AppConfig; key?: string; fetch?: Fetch; now?: () => number; cacheFile?: string | null };

async function github<T>(f: Fetch, url: string, auth: string, init: RequestInit = {}): Promise<T> {
  const res = await f(`https://api.github.com/${url}`, {
    ...init,
    headers: { authorization: auth, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const readKey = (key?: string) => {
  if (key) return key;
  if (!fs.existsSync(KEY_FILE)) throw new Error(`no app key at ${KEY_FILE}; see AGENTS.md "Agent identity"`);
  return fs.readFileSync(KEY_FILE, "utf8");
};

/**
 * An installation token for this repository only. Reused from the cache while it has more
 * than 5 minutes left; GitHub issues them for one hour.
 */
export async function installationToken(opts: Options = {}): Promise<{ token: string; expiresAt: string }> {
  const { app = APP, fetch: f = fetch, now = Date.now } = opts;
  const cacheFile = opts.cacheFile === undefined ? TOKEN_FILE : opts.cacheFile;
  if (cacheFile && fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (Date.parse(cached.expiresAt) - now() > 5 * 60_000) return cached;
  }
  const jwt = `Bearer ${appJwt(app.appId, readKey(opts.key), now())}`;
  const installation = await github<{ id: number }>(f, `repos/${app.repo}/installation`, jwt);
  const res = await github<{ token: string; expires_at: string }>(
    f,
    `app/installations/${installation.id}/access_tokens`,
    jwt,
    {
      method: "POST",
      body: JSON.stringify({ repositories: [app.repo.split("/")[1]] }),
    },
  );
  const token = { token: res.token, expiresAt: res.expires_at };
  if (cacheFile) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(cacheFile, JSON.stringify(token), { mode: 0o600 });
  }
  return token;
}

/** The permissions the app was granted, read with its own key. */
export async function appPermissions(opts: Options = {}): Promise<Record<string, string>> {
  const { app = APP, fetch: f = fetch, now = Date.now } = opts;
  const res = await github<{ permissions?: Record<string, string> }>(
    f,
    "app",
    `Bearer ${appJwt(app.appId, readKey(opts.key), now())}`,
  );
  return res.permissions ?? {};
}

/** GATE-018: the app can write code and pull requests, and nothing that changes protection or CI. */
export function evaluateAppPermissions(perms: Record<string, string>): Failure[] {
  const fix = "edit the ians-agent app's permissions on GitHub (Ian only), then accept the change on the installation";
  const failures: Failure[] = [];
  for (const forbidden of ["administration", "workflows", "secrets", "environments", "organization_administration"]) {
    if (perms[forbidden]) {
      failures.push({ rule: "agent-permission", message: `the agent app has ${forbidden}: ${perms[forbidden]}`, fix });
    }
  }
  for (const needed of ["contents", "pull_requests"]) {
    if (perms[needed] !== "write") {
      failures.push({ rule: "agent-permission", message: `the agent app needs ${needed}: write`, fix });
    }
  }
  return failures;
}
