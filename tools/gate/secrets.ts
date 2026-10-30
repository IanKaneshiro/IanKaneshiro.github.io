import type { AddedLine } from "./git";
import type { Failure } from "./types";

/** GATE-016: a change that adds a secret, key or token fails, naming the file and line. */

const PATTERNS: [name: string, re: RegExp][] = [
  ["private key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----/],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["xAI API key", /\bxai-[A-Za-z0-9]{32,}/],
  ["Slack token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Stripe key", /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}/],
  ["npm token", /\bnpm_[A-Za-z0-9]{36}\b/],
  [
    "hard-coded credential",
    /\b(?:api[_-]?key|secret|token|passw(?:or)?d|client[_-]?secret)\b["']?\s*[:=]\s*["'][A-Za-z0-9/+_=.-]{16,}["']/i,
  ],
];

const SECRET_FILES = /(?:^|\/)(?:\.env(?:\.[\w-]+)?|id_(?:rsa|ed25519|ecdsa)|[^/]+\.(?:pem|p12|pfx|key))$/;
const ALLOWED_FILES = /(?:^|\/)\.env\.example$|(?:^|\/)bun\.lock$/;

export function scanSecrets(lines: AddedLine[], files: string[] = []): Failure[] {
  const failures: Failure[] = [];
  for (const file of files) {
    if (SECRET_FILES.test(file) && !ALLOWED_FILES.test(file)) {
      failures.push({
        file,
        rule: "secret-file",
        message: "adds a file that usually holds secrets",
        fix: "remove it from the change and add it to .gitignore; put setting names (no values) in .env.example",
      });
    }
  }
  for (const { file, line, text } of lines) {
    if (ALLOWED_FILES.test(file)) continue;
    for (const [name, re] of PATTERNS) {
      if (!re.test(text)) continue;
      failures.push({
        file,
        line,
        rule: "secret",
        message: `looks like a ${name}`,
        fix: "remove it, rotate it if it was ever real, and read it from the environment instead",
      });
      break;
    }
  }
  return failures;
}
