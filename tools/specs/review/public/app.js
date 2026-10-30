// Spec review UI: explore the intent → journey → behavior graph and leave review notes.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const ID_RE = /\b([A-Z][A-Z0-9]*-\d{3})\b/g;

const STATUS = {
  approved: { glyph: "✓", label: "approve", key: "a" },
  change: { glyph: "✎", label: "change", key: "c" },
  question: { glyph: "?", label: "question", key: "q" },
};
const KIND_GLYPH = { intent: "◆", journey: "▸", behavior: "●", area: "▦" };

const state = {
  g: null,
  notes: {},
  idx: null,
  view: localStorage.getItem("review-view") || "graph",
  selected: decodeURIComponent(location.hash.slice(1)) || null,
  hover: null,
  query: "",
  filter: "all",
  visible: [],
};

// ── data ────────────────────────────────────────────────

async function load() {
  const [g, notes] = await Promise.all([
    fetch("/api/graph").then((r) => r.json()),
    fetch("/api/notes").then((r) => r.json()),
  ]);
  state.g = g;
  state.notes = notes;
  state.idx = buildIndex(g);
  if (state.selected && !state.idx.byId.has(state.selected)) state.selected = null;
  render();
}

function buildIndex(g) {
  const byId = new Map();
  const text = new Map();
  for (const i of g.intents) {
    byId.set(i.id, i);
    text.set(i.id, `${i.id} ${i.title} ${i.body}`.toLowerCase());
  }
  for (const j of g.journeys) {
    byId.set(j.id, j);
    text.set(j.id, `${j.id} ${j.title} ${j.actor} ${j.body} ${j.steps.map((s) => s.do).join(" ")}`.toLowerCase());
  }
  for (const b of g.behaviors) {
    byId.set(b.id, b);
    text.set(b.id, `${b.id} ${b.title} ${b.tags.join(" ")} ${b.steps.map((s) => s.text).join(" ")}`.toLowerCase());
  }
  const areas = g.features.map((f) => ({
    kind: "area",
    id: `AREA:${f.area}`,
    area: f.area,
    title: f.title,
    file: f.file,
    description: f.description,
    behaviors: f.behaviors,
  }));
  for (const a of areas) byId.set(a.id, a);

  const fileToId = new Map([...g.intents, ...g.journeys].map((n) => [n.file, n.id]));
  for (const a of areas) fileToId.set(a.file, a.id);

  const journeyAreas = new Map(); // journey id → Map(area id → behavior count)
  for (const j of g.journeys) {
    const counts = new Map();
    const seen = new Set();
    for (const s of j.steps)
      for (const b of s.behaviors) {
        const n = byId.get(b);
        if (seen.has(b) || n?.kind !== "behavior") continue;
        seen.add(b);
        counts.set(`AREA:${n.area}`, (counts.get(`AREA:${n.area}`) || 0) + 1);
      }
    journeyAreas.set(j.id, counts);
  }
  const reviewable = [
    ...g.intents,
    ...g.journeys,
    ...g.features.flatMap((f) => f.behaviors.map((id) => byId.get(id))),
  ].filter((n) => n && !n.retired);
  return { byId, text, areas, fileToId, journeyAreas, reviewable };
}

const node = (id) => state.idx.byId.get(id);
const journeysOf = (bid) => [...new Set((state.g.usedBy[bid] || []).map((u) => u.journey))];

/** Everything connected to a node, as graph-view ids (behaviors collapse to their area). */
function neighborhood(id) {
  const n = node(id);
  const set = new Set([id]);
  if (!n) return set;
  const addJourney = (jid, withIntents) => {
    set.add(jid);
    for (const a of state.idx.journeyAreas.get(jid)?.keys() || []) set.add(a);
    if (withIntents) for (const i of node(jid)?.intents || []) set.add(i);
  };
  if (n.kind === "intent") (state.g.servedBy[id] || []).forEach((j) => addJourney(j, false));
  if (n.kind === "journey") addJourney(id, true);
  if (n.kind === "area")
    for (const [jid, m] of state.idx.journeyAreas)
      if (m.has(id)) {
        set.add(jid);
        node(jid).intents.forEach((i) => set.add(i));
      }
  if (n.kind === "behavior") {
    set.add(`AREA:${n.area}`);
    for (const jid of journeysOf(id)) {
      set.add(jid);
      node(jid).intents.forEach((i) => set.add(i));
    }
  }
  return set;
}

function search(q) {
  const query = q.trim().toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits = [];
  for (const [id, t] of state.idx.text) {
    if (!terms.every((x) => t.includes(x))) continue;
    const n = node(id);
    const lid = id.toLowerCase();
    let score = lid === query ? 1000 : 0;
    for (const x of terms) score += (lid.includes(x) ? 50 : 0) + (n.title.toLowerCase().includes(x) ? 10 : 0);
    score += { intent: 3, journey: 2, behavior: 1 }[n.kind];
    hits.push({ id, score });
  }
  return hits.sort((a, b) => b.score - a.score).map((h) => h.id);
}

// ── markdown (just enough for the specs) ────────────────

function mdLink(text, url) {
  const [file] = url.replace(/^\.\//, "").split("#");
  const id = state.idx.fileToId.get(file);
  if (id) return `<button class="ref" data-go="${esc(id)}">${esc(text)}</button>`;
  if (/^https?:\/\//.test(url))
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  return `<span class="ref-dead" title="${esc(url)}">${esc(text)}</span>`;
}

function linkIds(html) {
  return html.replace(ID_RE, (m) => (state.idx.byId.has(m) ? `<button class="ref" data-go="${m}">${m}</button>` : m));
}

function inline(s) {
  const keep = [];
  const put = (html) => `\uE000${keep.push(html) - 1}\uE001`;
  let h = String(s);
  h = h.replace(/`([^`]+)`/g, (_, c) => put(`<code>${esc(c)}</code>`));
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => put(mdLink(t, u)));
  h = esc(h)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,:;!?]|$)/g, "$1<em>$2</em>");
  h = linkIds(h);
  return h.replace(/\uE000(\d+)\uE001/g, (_, k) => keep[Number(k)]);
}

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function parseList(lines, i) {
  const indent = LIST_ITEM.exec(lines[i])[1].length;
  const ordered = /^\s*\d+\./.test(lines[i]);
  const items = [];
  while (i < lines.length) {
    const l = lines[i];
    const m = LIST_ITEM.exec(l);
    if (m && m[1].length === indent) {
      items.push({ text: [m[3]], sub: "" });
      i++;
    } else if (m && m[1].length > indent && items.length) {
      const r = parseList(lines, i);
      items.at(-1).sub += r.html;
      i = r.i;
    } else if (!m && l.trim() && /^\s+/.test(l) && items.length) {
      items.at(-1).text.push(l.trim());
      i++;
    } else if (
      !l.trim() &&
      i + 1 < lines.length &&
      LIST_ITEM.exec(lines[i + 1])?.[1].length >= indent &&
      items.length
    ) {
      i++; // blank line inside a list
    } else break;
  }
  const tag = ordered ? "ol" : "ul";
  return {
    html: `<${tag}>${items.map((it) => `<li>${inline(it.text.join(" "))}${it.sub}</li>`).join("")}</${tag}>`,
    i,
  };
}

function md(src) {
  const lines = String(src || "")
    .replace(/\r/g, "")
    .split("\n");
  const out = [];
  const cells = (l) =>
    l
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, "|"));
  const isTable = (k) => /^\s*\|/.test(lines[k] || "") && /^\s*\|?\s*:?-{2,}/.test(lines[k + 1] || "");
  const startsBlock = (k) => /^(```|#{1,6}\s)/.test(lines[k]) || LIST_ITEM.test(lines[k]) || isTable(k);
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
    } else if (/^#{1,6}\s/.test(l)) {
      const level = Math.min(l.match(/^#+/)[0].length + 1, 6);
      out.push(`<h${level}>${inline(l.replace(/^#+\s*/, ""))}</h${level}>`);
      i++;
    } else if (isTable(i)) {
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
    } else if (LIST_ITEM.test(l)) {
      const r = parseList(lines, i);
      out.push(r.html);
      i = r.i;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !startsBlock(i)) buf.push(lines[i++].trim());
      out.push(`<p>${inline(buf.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

// ── shared bits ─────────────────────────────────────────

const statusOf = (id) => state.notes[id]?.status || null;
const glyph = (id) => (statusOf(id) ? STATUS[statusOf(id)].glyph : "○");

function chip(id) {
  const n = node(id);
  const st = statusOf(id);
  const label = n?.kind === "area" ? n.area : id;
  return `<button class="chip k-${n?.kind || "missing"}${st ? ` st-${st}` : ""}" data-go="${esc(id)}" title="${esc(n?.title || "doesn't exist")}">${
    st ? `<span class="chip-st">${STATUS[st].glyph}</span>` : ""
  }${esc(label)}</button>`;
}

function behaviorRow(id) {
  const st = statusOf(id);
  return `<button class="row" data-go="${esc(id)}"><span class="st${st ? ` st-${st}` : ""}">${glyph(id)}</span><span class="row-id">${esc(id)}</span><span class="row-title">${esc(node(id)?.title ?? "doesn't exist")}</span></button>`;
}

function gherkin(b) {
  const step = (t) => linkIds(esc(t).replace(/&quot;([^&]*)&quot;/g, '<span class="g-str">&quot;$1&quot;</span>'));
  return [
    `<span class="g-tag">@${esc(b.id)}${b.tags.length ? ` ${esc(b.tags.join(" "))}` : ""}</span>`,
    `<span class="g-kw">Scenario:</span> <span class="g-title">${esc(b.title)}</span>`,
    ...b.steps.map((s) => `  <span class="g-kw">${esc(s.keyword)}</span> ${step(s.text)}`),
  ].join("\n");
}

// ── views ───────────────────────────────────────────────

function render() {
  if (!state.g) return;
  $$(".views button").forEach((b) => b.classList.toggle("on", b.dataset.view === state.view));
  renderProgress();
  renderProblemsPill();
  renderMain();
  renderDetail();
}

function renderMain() {
  const main = $("#main");
  const top = main.scrollTop;
  if (state.view === "graph") renderGraph(main);
  else if (state.view === "review") renderReview(main);
  else main.innerHTML = `<article class="md readme">${md(state.g.readme)}</article>`;
  main.scrollTop = top;
}

function renderGraph(main) {
  const g = state.g;
  const { journeyAreas, areas } = state.idx;
  const W = Math.max(760, main.clientWidth - 48);
  const gutter = Math.max(80, Math.min(180, W * 0.11));
  const colW = Math.floor((W - 2 * gutter) / 3);
  const xs = [0, colW + gutter, 2 * (colW + gutter)];
  const NODE_H = 48;
  const GAP = 10;
  const TOP = 34;

  // Order columns to keep edges short: journeys by their intents, areas by their journeys.
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const intents = g.intents.filter((i) => !i.retired);
  const iPos = new Map(intents.map((i, k) => [i.id, k]));
  const journeys = g.journeys
    .filter((j) => !j.retired)
    .map((j) => ({ j, key: mean(j.intents.map((i) => iPos.get(i) ?? 0)) }))
    .sort((a, b) => a.key - b.key || a.j.id.localeCompare(b.j.id))
    .map((x) => x.j);
  const jPos = new Map(journeys.map((j, k) => [j.id, k]));
  const areaKey = (a) => {
    let sum = 0;
    let weight = 0;
    for (const [jid, m] of journeyAreas)
      if (m.has(a.id) && jPos.has(jid)) {
        sum += jPos.get(jid) * m.get(a.id);
        weight += m.get(a.id);
      }
    return weight ? sum / weight : 999;
  };
  const areaList = [...areas].sort((a, b) => areaKey(a) - areaKey(b));

  const cols = [intents, journeys, areaList];
  const colH = (n) => n * NODE_H + Math.max(0, n - 1) * GAP;
  const maxH = Math.max(...cols.map((c) => colH(c.length)));
  const pos = new Map();
  cols.forEach((c, ci) => {
    const y0 = TOP + (maxH - colH(c.length)) / 2;
    c.forEach((n, k) => pos.set(n.id, { x: xs[ci], y: y0 + k * (NODE_H + GAP) }));
  });

  const edges = [];
  for (const j of journeys) {
    for (const i of j.intents) if (pos.has(i)) edges.push({ from: i, to: j.id, w: 1 });
    for (const [a, count] of journeyAreas.get(j.id)) edges.push({ from: j.id, to: a, w: count });
  }
  const curve = (e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    const x1 = a.x + colW;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };
  const maxChars = Math.max(10, Math.floor((colW - 30) / 6.9));
  const trunc = (s) => (s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s);

  const nodeSvg = (n) => {
    const p = pos.get(n.id);
    const label = n.kind === "area" ? n.area : n.id;
    let badge;
    if (n.kind === "area") {
      const done = n.behaviors.filter((b) => statusOf(b)).length;
      badge = `<text class="n-badge" x="${p.x + colW - 10}" y="${p.y + 18}" text-anchor="end">${done}/${n.behaviors.length}</text>`;
    } else {
      badge = `<text class="n-badge st-${statusOf(n.id) || "none"}" x="${p.x + colW - 10}" y="${p.y + 18}" text-anchor="end">${glyph(n.id)}</text>`;
    }
    return `<g class="node k-${n.kind}" data-id="${esc(n.id)}"><title>${esc(label)} · ${esc(n.title)}</title>
      <rect x="${p.x}" y="${p.y}" width="${colW}" height="${NODE_H}" rx="4"/>
      <rect class="n-bar" x="${p.x}" y="${p.y}" width="3" height="${NODE_H}" rx="1"/>
      <text class="n-id" x="${p.x + 12}" y="${p.y + 18}">${esc(label)}</text>${badge}
      <text class="n-title" x="${p.x + 12}" y="${p.y + 36}">${esc(trunc(n.title))}</text></g>`;
  };

  const height = TOP + maxH + 12;
  main.innerHTML = `<p class="hint"><b>hover</b> to trace a path · <b>click</b> for details · areas show reviewed/total · edge width = behaviors used</p>
    <svg class="graph" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="Intents, journeys and behavior areas">
      ${["intents · why", "journeys · who & how", "behaviors by area · what"]
        .map((h, k) => `<text class="col-h" x="${xs[k]}" y="14">${h}</text>`)
        .join("")}
      <g>${edges
        .map(
          (e) =>
            `<path class="edge" data-from="${esc(e.from)}" data-to="${esc(e.to)}" d="${curve(e)}" stroke-width="${(1.2 + Math.log2(e.w) * 1.3).toFixed(2)}"/>`,
        )
        .join("")}</g>
      <g>${cols.flat().map(nodeSvg).join("")}</g>
    </svg>`;

  const svg = $("svg", main);
  svg.addEventListener("mouseover", (e) => {
    const id = e.target.closest(".node")?.dataset.id ?? null;
    if (id !== state.hover) {
      state.hover = id;
      updateHighlight();
    }
  });
  svg.addEventListener("mouseleave", () => {
    state.hover = null;
    updateHighlight();
  });
  svg.addEventListener("click", (e) => {
    const n = e.target.closest(".node");
    if (n) select(n.dataset.id);
  });
  updateHighlight();
}

function updateHighlight() {
  const svg = $("#main svg.graph");
  if (!svg) return;
  let focus = null;
  if (state.hover) focus = neighborhood(state.hover);
  else if (state.selected && state.idx.byId.has(state.selected)) focus = neighborhood(state.selected);
  else if (state.query.trim()) {
    focus = new Set();
    for (const id of search(state.query)) {
      const n = node(id);
      focus.add(n.kind === "behavior" ? `AREA:${n.area}` : id);
    }
  }
  const sel = state.selected && node(state.selected);
  const selGraphId = sel?.kind === "behavior" ? `AREA:${sel.area}` : state.selected;
  for (const el of $$(".node", svg)) {
    el.classList.toggle("dim", !!focus && !focus.has(el.dataset.id));
    el.classList.toggle("sel", el.dataset.id === selGraphId);
  }
  for (const el of $$(".edge", svg)) {
    const on = !!focus && focus.has(el.dataset.from) && focus.has(el.dataset.to);
    el.classList.toggle("hot", on);
    el.classList.toggle("dim", !!focus && !on);
  }
}

function renderReview(main) {
  const { reviewable } = state.idx;
  const counts = { all: reviewable.length, unreviewed: 0, change: 0, question: 0, approved: 0 };
  for (const n of reviewable) counts[statusOf(n.id) || "unreviewed"]++;
  const hits = state.query.trim() ? new Set(search(state.query)) : null;
  const show = (n) =>
    (state.filter === "all" || (statusOf(n.id) || "unreviewed") === state.filter) && (!hits || hits.has(n.id));

  const groups = [
    { title: "Intents", sub: "why", items: state.g.intents },
    { title: "Journeys", sub: "who & how", items: state.g.journeys },
    ...state.g.features.map((f) => ({ title: `${f.area} · ${f.title}`, sub: f.file, items: f.behaviors.map(node) })),
  ];
  state.visible = [];
  const html = groups
    .map((grp) => {
      const items = grp.items.filter((n) => n && !n.retired && show(n));
      if (!items.length) return "";
      state.visible.push(...items.map((n) => n.id));
      return `<div class="group-h">${esc(grp.title)} <small>${esc(grp.sub)}</small></div>${items
        .map((n) => {
          const st = statusOf(n.id);
          const note = state.notes[n.id]?.note?.trim();
          return `<button class="rrow${n.id === state.selected ? " sel" : ""}" data-go="${esc(n.id)}" data-row="${esc(n.id)}">
            <span class="st${st ? ` st-${st}` : ""}">${glyph(n.id)}</span><span class="kind-g">${KIND_GLYPH[n.kind]}</span>
            <span class="row-id">${esc(n.id)}</span><span class="row-title">${esc(n.title)}</span>
            ${note ? `<span class="row-note">“${esc(note)}”</span>` : ""}</button>`;
        })
        .join("")}`;
    })
    .join("");

  main.innerHTML = `<div class="filters">${["all", "unreviewed", "change", "question", "approved"]
    .map(
      (f) =>
        `<button class="filter${state.filter === f ? " on" : ""}" data-filter="${f}">${f}<span>${counts[f]}</span></button>`,
    )
    .join(
      "",
    )}<span class="spacer"></span><button class="btn" id="copy" title="Copy a Markdown summary of your notes">copy summary</button></div>${
    html || `<div class="empty">nothing here${state.query ? ` for “${esc(state.query)}”` : ""}</div>`
  }`;
}

function head(n, extra = "") {
  return `<div class="d-kind">${KIND_GLYPH[n.kind]} ${n.kind}${n.retired ? ' · <span class="retired">retired</span>' : ""}</div>
    <h2 class="d-title"><span class="d-id">${esc(n.kind === "area" ? n.area : n.id)}</span>${esc(n.title)}</h2>
    <div class="d-file">${esc(n.file)}${n.line ? `:${n.line}` : ""}</div>${extra}`;
}

function reviewBox(id) {
  const note = state.notes[id] || {};
  return `<div class="review" data-review="${esc(id)}">
    <div class="seg" role="group" aria-label="Review status">${Object.entries(STATUS)
      .map(
        ([k, s]) =>
          `<button class="seg-btn st-${k}${note.status === k ? " on" : ""}" data-status="${k}" aria-pressed="${note.status === k}">${s.glyph} ${s.label} <kbd>${s.key}</kbd></button>`,
      )
      .join("")}</div>
    <textarea class="note" rows="3" placeholder="Note for Claude: what should change, or what's unclear. Saves as you type.">${esc(note.note || "")}</textarea>
    <div class="saved">${note.updated ? `saved ${new Date(note.updated).toLocaleString()}` : "not reviewed yet"}</div>
  </div>`;
}

function journeyCard(j) {
  return `<div class="card"><button class="card-title" data-go="${esc(j.id)}"><span class="d-id">${esc(j.id)}</span>${esc(j.title)}</button>
    <div class="card-actor">${esc(j.actor)}</div>
    <ol class="steps">${j.steps
      .map((s) => `<li><span>${esc(s.do)}</span><div class="chips">${s.behaviors.map(chip).join("")}</div></li>`)
      .join("")}</ol></div>`;
}

const DETAIL = {
  intent(n) {
    const js = (state.g.servedBy[n.id] || []).map(node);
    return `${head(n)}${reviewBox(n.id)}<div class="md">${md(n.body)}</div>
      <h3 class="d-h">served by ${js.length} ${js.length === 1 ? "journey" : "journeys"}</h3>${js.map(journeyCard).join("")}`;
  },
  journey(j) {
    return `${head(
      j,
      `<div class="d-actor"><span class="lbl">actor</span>${esc(j.actor)}</div><div class="d-serves"><span class="lbl">serves</span>${j.intents
        .map(chip)
        .join("")}</div>`,
    )}${reviewBox(j.id)}
      <h3 class="d-h">steps</h3><ol class="steps big">${j.steps
        .map((s) => `<li><div class="step-do">${esc(s.do)}</div>${s.behaviors.map(behaviorRow).join("")}</li>`)
        .join("")}</ol>${j.body ? `<h3 class="d-h">notes</h3><div class="md">${md(j.body)}</div>` : ""}`;
  },
  behavior(b) {
    const uses = state.g.usedBy[b.id] || [];
    const siblings = new Set();
    for (const u of uses) for (const x of node(u.journey).steps[u.step - 1].behaviors) if (x !== b.id) siblings.add(x);
    const intents = [...new Set(uses.flatMap((u) => node(u.journey).intents))];
    return `${head(
      b,
      `<div class="d-serves"><span class="lbl">area</span>${chip(`AREA:${b.area}`)}${b.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`,
    )}${reviewBox(b.id)}
      <pre class="gherkin">${gherkin(b)}</pre>
      <h3 class="d-h">why it exists</h3>${
        intents.map((i) => `<div class="trace-row">${chip(i)}<span>${esc(node(i)?.title)}</span></div>`).join("") ||
        '<p class="muted">No intent: this behavior is in no journey.</p>'
      }
      <h3 class="d-h">used in</h3>${uses
        .map(
          (u) =>
            `<div class="use">${chip(u.journey)}<span class="muted">step ${u.step}</span><span>${esc(node(u.journey).steps[u.step - 1].do)}</span></div>`,
        )
        .join(
          "",
        )}${siblings.size ? `<h3 class="d-h">shares steps with</h3><div class="chips">${[...siblings].map(chip).join("")}</div>` : ""}`;
  },
  area(a) {
    const js = [...state.idx.journeyAreas].filter(([, m]) => m.has(a.id)).map(([j]) => j);
    return `${head(a, a.description ? `<div class="md muted">${md(a.description)}</div>` : "")}
      <h3 class="d-h">${a.behaviors.length} behaviors</h3>${a.behaviors.map(behaviorRow).join("")}
      <h3 class="d-h">used by journeys</h3><div class="chips">${js.map(chip).join("")}</div>`;
  },
};

function overviewDetail() {
  const g = state.g;
  const p = g.problems;
  return `<div class="d-kind">spec graph</div>
    <h2 class="d-title">${g.intents.length} intents · ${g.journeys.length} journeys · ${g.behaviors.length} behaviors</h2>
    <div class="problems ${p.length ? "bad" : "good"}">${
      p.length
        ? `<strong>⚠ ${p.length} ${p.length === 1 ? "problem" : "problems"}</strong><ul>${p.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
        : "✓ The graph is consistent: no orphans, every reference resolves, and the Gherkin parses."
    }</div>
    <h3 class="d-h">how to review</h3>
    <ol class="howto">
      <li>Open <b>review</b> (<kbd>2</kbd>) and read top-down: intents, then journeys, then behaviors.</li>
      <li>Mark each item <kbd>a</kbd> approve (moves to the next one), <kbd>c</kbd> change or <kbd>q</kbd> question, and write a note with <kbd>n</kbd>.</li>
      <li>Use <b>graph</b> (<kbd>1</kbd>) to see how things connect. Hover traces a path, click opens it.</li>
      <li>Tell Claude the review is done. Notes are saved to <code>specs/portfolio/review-notes.json</code>.</li>
    </ol>
    <h3 class="d-h">keys</h3>
    <dl class="keys"><dt>/</dt><dd>search</dd><dt>j k</dt><dd>next or previous item</dd><dt>a c q</dt><dd>approve, change, question</dd>
      <dt>n</dt><dd>write a note</dd><dt>1 2 3</dt><dd>graph, review, readme</dd><dt>t</dt><dd>light or dark</dd><dt>esc</dt><dd>close or clear</dd></dl>`;
}

function renderDetail(force = false) {
  const el = $("#detail");
  if (!force && document.activeElement?.matches("#detail textarea")) return;
  const n = state.selected && node(state.selected);
  el.innerHTML = n ? DETAIL[n.kind](n) : overviewDetail();
}

function renderProgress() {
  const all = state.idx.reviewable;
  const c = { approved: 0, change: 0, question: 0 };
  for (const n of all) if (statusOf(n.id)) c[statusOf(n.id)]++;
  const pct = (k) => `${((100 * c[k]) / Math.max(1, all.length)).toFixed(2)}%`;
  $("#progress").innerHTML = `<span class="pbar" aria-hidden="true">${Object.keys(c)
    .map((k) => `<i class="st-${k}" style="width:${pct(k)}"></i>`)
    .join("")}</span><span>${c.approved + c.change + c.question}/${all.length} reviewed</span>`;
}

function renderProblemsPill() {
  const n = state.g.problems.length;
  const pill = $("#problems");
  pill.className = `pill ${n ? "bad" : "good"}`;
  pill.textContent = n ? `⚠ ${n} ${n === 1 ? "problem" : "problems"}` : "✓ consistent";
}

function renderResults() {
  const box = $("#results");
  if (!state.query.trim()) {
    box.hidden = true;
    return;
  }
  const ids = search(state.query).slice(0, 14);
  box.innerHTML = ids.length
    ? ids
        .map((id, k) => {
          const n = node(id);
          return `<button class="res${k === 0 ? " first" : ""}" data-go="${esc(id)}"><span class="st${statusOf(id) ? ` st-${statusOf(id)}` : ""}">${glyph(id)}</span><span class="kind-g">${KIND_GLYPH[n.kind]}</span><span class="row-id">${esc(id)}</span><span class="row-title">${esc(n.title)}</span></button>`;
        })
        .join("")
    : `<div class="res-empty">no matches</div>`;
  box.hidden = false;
}

// ── actions ─────────────────────────────────────────────

function select(id) {
  state.selected = id || null;
  history.replaceState(null, "", id ? `#${encodeURIComponent(id)}` : location.pathname);
  renderDetail(true);
  $("#detail").scrollTop = 0;
  if (state.view === "graph") updateHighlight();
  if (state.view === "review") {
    $$("#main .rrow").forEach((r) => r.classList.toggle("sel", r.dataset.row === id));
    if (id) $(`#main .rrow[data-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
  }
}

function setView(view) {
  state.view = view;
  localStorage.setItem("review-view", view);
  state.hover = null;
  render();
  $("#main").scrollTop = 0;
}

const navOrder = () => (state.view === "review" ? state.visible : state.idx.reviewable.map((n) => n.id));

function move(delta) {
  const list = navOrder();
  if (!list.length) return;
  const i = list.indexOf(state.selected);
  const next = i < 0 ? list[delta > 0 ? 0 : list.length - 1] : list[Math.min(list.length - 1, Math.max(0, i + delta))];
  select(next);
}

async function saveNote(id, patch) {
  const next = { status: null, note: "", ...state.notes[id], ...patch, updated: new Date().toISOString() };
  if (!next.status && !next.note.trim()) delete state.notes[id];
  else state.notes[id] = next;
  const res = await fetch("/api/notes", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, status: next.status ?? null, note: next.note ?? "" }),
  }).catch(() => null);
  if (!res?.ok) return toast("⚠ couldn't save; is the server running?");
  const saved = $(`#detail .review[data-review="${CSS.escape(id)}"] .saved`);
  if (saved) saved.textContent = `saved ${new Date().toLocaleTimeString()}`;
}

function setStatus(status, { advance = false } = {}) {
  const id = state.selected;
  const n = id && node(id);
  if (!n || n.kind === "area") return;
  const before = navOrder();
  const next = statusOf(id) === status ? null : status;
  saveNote(id, { status: next });
  for (const b of $$(`#detail .review[data-review="${CSS.escape(id)}"] .seg-btn`)) {
    const on = b.dataset.status === next;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  }
  renderProgress();
  renderMain();
  if (advance && next === "approved") {
    const after = navOrder();
    const following = before.slice(before.indexOf(id) + 1).find((x) => after.includes(x));
    if (following) select(following);
  } else if (next === "change" || next === "question") {
    $("#detail textarea.note")?.focus();
  }
}

function toggleTheme() {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  localStorage.setItem("review-theme", t);
}

function summary() {
  const by = { change: [], question: [], approved: [] };
  for (const n of state.idx.reviewable) if (statusOf(n.id)) by[statusOf(n.id)].push(n);
  const line = (n) => {
    const note = state.notes[n.id]?.note?.trim().replace(/\s*\n\s*/g, " ");
    return `- **${n.id}** ${n.title}${note ? `: ${note}` : ""}`;
  };
  return [
    "# Spec review",
    "",
    `${by.approved.length} approved, ${by.change.length} to change, ${by.question.length} questions, out of ${state.idx.reviewable.length}.`,
    "",
    "## Change",
    ...(by.change.length ? by.change.map(line) : ["None."]),
    "",
    "## Questions",
    ...(by.question.length ? by.question.map(line) : ["None."]),
    "",
    "## Approved",
    by.approved.map((n) => n.id).join(", ") || "None.",
    "",
  ].join("\n");
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 1800);
}

// ── events ──────────────────────────────────────────────

document.addEventListener("click", async (e) => {
  const t = e.target;
  const go = t.closest("[data-go]");
  if (go) {
    $("#results").hidden = true;
    return select(go.dataset.go);
  }
  const view = t.closest("[data-view]");
  if (view) return setView(view.dataset.view);
  const filter = t.closest("[data-filter]");
  if (filter) {
    state.filter = filter.dataset.filter;
    renderMain();
    $("#main").scrollTop = 0;
    return;
  }
  const status = t.closest("[data-status]");
  if (status) return setStatus(status.dataset.status);
  if (t.closest("#copy")) {
    await navigator.clipboard.writeText(summary()).then(
      () => toast("copied the review summary"),
      () => toast("⚠ couldn't copy to the clipboard"),
    );
    return;
  }
  if (t.closest("#problems")) return select(null);
  if (t.closest("#theme")) return toggleTheme();
  if (!t.closest(".search")) $("#results").hidden = true;
});

const noteTimers = new Map();
$("#detail").addEventListener("input", (e) => {
  if (!e.target.matches("textarea.note")) return;
  const id = e.target.closest(".review").dataset.review;
  const value = e.target.value;
  clearTimeout(noteTimers.get(id));
  noteTimers.set(
    id,
    setTimeout(async () => {
      await saveNote(id, { note: value });
      renderProgress();
      if (state.view === "review") renderMain();
    }, 450),
  );
});

$("#q").addEventListener("input", (e) => {
  state.query = e.target.value;
  renderResults();
  if (state.view === "graph") updateHighlight();
  if (state.view === "review") renderMain();
});
$("#q").addEventListener("focus", renderResults);
$("#results").addEventListener("mousedown", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  const t = e.target;
  const typing = t.matches?.("input, textarea");
  if (e.key === "Escape") {
    if (typing) {
      t.blur();
      $("#results").hidden = true;
    } else if (state.query) {
      state.query = "";
      $("#q").value = "";
      render();
    } else select(null);
    return;
  }
  if (typing) {
    if (t.id === "q" && e.key === "Enter") {
      const first = search(state.query)[0];
      if (first) {
        select(first);
        $("#results").hidden = true;
        t.blur();
      }
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const actions = {
    "/": () => $("#q").select(),
    1: () => setView("graph"),
    2: () => setView("review"),
    3: () => setView("overview"),
    j: () => move(1),
    k: () => move(-1),
    a: () => setStatus("approved", { advance: true }),
    c: () => setStatus("change"),
    q: () => setStatus("question"),
    n: () => $("#detail textarea.note")?.focus(),
    t: toggleTheme,
  };
  if (state.view === "review") Object.assign(actions, { ArrowDown: () => move(1), ArrowUp: () => move(-1) });
  const action = actions[e.key];
  if (action) {
    e.preventDefault();
    action();
  }
});

window.addEventListener("hashchange", () => {
  const id = decodeURIComponent(location.hash.slice(1)) || null;
  if (id !== state.selected) select(id);
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => state.view === "graph" && renderMain(), 120);
});

const events = new EventSource("/events");
events.addEventListener("specs", async () => {
  await load();
  toast("↻ specs reloaded");
});

load();
