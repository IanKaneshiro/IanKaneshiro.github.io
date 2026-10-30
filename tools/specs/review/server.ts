import fs from "node:fs";
import path from "node:path";
import { loadGraph } from "../graph";

/**
 * Local spec review UI. Serves the graph live from specs/portfolio, pushes a reload
 * event whenever a spec file changes, and saves review notes to review-notes.json
 * next to the specs, so an agent can read the feedback back.
 *
 *   bun run specs:review            → http://localhost:4400
 *   PORT=5000 bun run specs:review
 */

const root = path.resolve(import.meta.dir, "../../../specs/portfolio");
const notesFile = path.join(root, "review-notes.json");
const assets = path.join(import.meta.dir, "public");
const port = Number(process.env.PORT ?? 4400);

type Note = { status: "approved" | "change" | "question" | null; note: string; updated: string };
const STATUSES = new Set(["approved", "change", "question", null]);

function readNotes(): Record<string, Note> {
  try {
    return JSON.parse(fs.readFileSync(notesFile, "utf8"));
  } catch {
    return {};
  }
}

// Live reload over server-sent events.
const clients = new Set<ReadableStreamDefaultController<string>>();
function broadcast(event: string) {
  for (const c of clients) {
    try {
      c.enqueue(`event: ${event}\ndata: ${Date.now()}\n\n`);
    } catch {
      clients.delete(c);
    }
  }
}
let pending: ReturnType<typeof setTimeout> | undefined;
const IGNORED = new Set(["review-notes.json", "GRAPH.md", "graph.json"]);
for (const dir of [root, ...["intents", "journeys", "features"].map((d) => path.join(root, d))]) {
  if (!fs.existsSync(dir)) continue;
  fs.watch(dir, (_event, name) => {
    if (!name || IGNORED.has(String(name))) return;
    clearTimeout(pending);
    pending = setTimeout(() => broadcast("specs"), 150);
  });
}
setInterval(() => broadcast("ping"), 20_000);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req, srv) {
    const url = new URL(req.url);

    if (url.pathname === "/api/graph") {
      const readme = fs.existsSync(path.join(root, "README.md")) ? fs.readFileSync(path.join(root, "README.md"), "utf8") : "";
      return json({ ...loadGraph(root), readme, root });
    }

    if (url.pathname === "/api/notes" && req.method === "GET") return json(readNotes());

    if (url.pathname === "/api/notes" && req.method === "PUT") {
      const body = (await req.json().catch(() => null)) as { id?: string; status?: Note["status"]; note?: string } | null;
      if (!body?.id || !/^[A-Z][A-Z0-9]*-\d{3}$/.test(body.id) || !STATUSES.has(body.status ?? null)) {
        return json({ error: "expected { id, status: approved|change|question|null, note }" }, 400);
      }
      const notes = readNotes();
      const note = String(body.note ?? "").slice(0, 5000);
      if (!body.status && !note.trim()) delete notes[body.id];
      else notes[body.id] = { status: body.status ?? null, note, updated: new Date().toISOString() };
      const sorted = Object.fromEntries(Object.entries(notes).sort(([a], [b]) => a.localeCompare(b)));
      fs.writeFileSync(notesFile, `${JSON.stringify(sorted, null, 2)}\n`);
      return json(sorted);
    }

    if (url.pathname === "/events") {
      srv.timeout(req, 0);
      let self: ReadableStreamDefaultController<string>;
      return new Response(
        new ReadableStream<string>({
          start(c) {
            self = c;
            clients.add(c);
            c.enqueue("retry: 1000\n\n");
          },
          cancel() {
            clients.delete(self);
          },
        }),
        { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } },
      );
    }

    const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (/^[\w.-]+$/.test(name)) {
      const file = Bun.file(path.join(assets, name));
      if (await file.exists()) return new Response(file, { headers: { "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`spec review → http://localhost:${server.port}`);
console.log(`reading ${path.relative(process.cwd(), root) || root}; notes save to ${path.relative(process.cwd(), notesFile)}`);
