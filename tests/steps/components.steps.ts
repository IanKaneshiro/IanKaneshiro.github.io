import { expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import stylelint from "stylelint";
import { stylelintFailures } from "../../tools/gate/checks";
import { componentDoc, renderApi, type ComponentDoc, type DocsJson } from "../../packages/components/src/docs/api";
import { ensureBuilt, open, scriptText, settle, type Opened } from "../support/browser";
import { Given, Then, When } from "../support/steps";

const ROOT = path.resolve(import.meta.dir, "../..");
const COMPONENTS = path.join(ROOT, "packages/components");
const SRC = path.join(COMPONENTS, "src/components");

/** docs.json from the build the browser harness runs (open() builds once per test run). */
async function docs(): Promise<DocsJson> {
  await ensureBuilt();
  return JSON.parse(fs.readFileSync(path.join(COMPONENTS, "docs.json"), "utf8"));
}
const tags = async () => (await docs()).components.map((c) => c.tag);

/** Every story of every component, as HTML, leaving out the API pages. */
async function stories(): Promise<{ tag: string; name: string; html: string }[]> {
  // The stories import docs.json, which the Stencil build writes: build first (a fresh checkout has none).
  await ensureBuilt();
  const out: { tag: string; name: string; html: string }[] = [];
  for (const tag of fs.readdirSync(SRC).sort()) {
    const file = path.join(SRC, tag, `${tag}.stories.ts`);
    if (!fs.existsSync(file)) continue;
    const mod = (await import(file)) as Record<string, { render?: () => string }>;
    for (const [name, story] of Object.entries(mod)) {
      if (name === "default" || name === "Api" || typeof story?.render !== "function") continue;
      out.push({ tag, name, html: story.render() });
    }
  }
  return out;
}

/** Everything a page needs to show each component at least once. */
const everything = async () => (await stories()).map((s) => s.html).join("\n");

const shadowTexts = (o: Opened, selector: string) =>
  o.page.$$eval(selector, (els) =>
    els.map((el) => {
      const texts: string[] = [];
      const walk = (n: Node) => {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const e = n as Element;
          if (e.getAttribute("aria-hidden") === "true" || e.classList.contains("visually-hidden")) return;
          if (e.tagName === "SLOT") return;
        }
        if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) texts.push(n.textContent.trim());
        n.childNodes.forEach(walk);
      };
      el.shadowRoot!.childNodes.forEach(walk);
      return { attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])), texts };
    }),
  );

// ── CMP-001 One prefix ──────────────────────────────────

Then("every component's tag starts with kan- and its class name starts with Kan", async () => {
  const all = (await docs()).components;
  expect(all.length).toBeGreaterThanOrEqual(3);
  for (const c of all) {
    expect(c.tag.startsWith("kan-")).toBe(true);
    const src = fs.readFileSync(path.join(SRC, c.tag, `${c.tag}.tsx`), "utf8");
    const pascal = c.tag
      .split("-")
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join("");
    expect([c.tag, src.includes(`export class ${pascal} {`)]).toEqual([c.tag, true]);
    expect(pascal.startsWith("Kan")).toBe(true);
  }
});

// ── CMP-002 Styled only with semantic tokens ────────────

Then("component stylesheets contain no raw color values and no primitive token properties", async () => {
  const files = (await tags()).map((t) => path.join(SRC, t, `${t}.css`));
  for (const f of files) expect(fs.existsSync(f)).toBe(true);
  const res = await stylelint.lint({ cwd: ROOT, files });
  expect(stylelintFailures(res.results, ROOT)).toEqual([]);
  for (const f of files) {
    const css = fs.readFileSync(f, "utf8");
    expect([f, /#[0-9a-f]{3,8}\b|oklch\(|rgba?\(/i.test(css)]).toEqual([f, false]);
  }
});

Then("lint fails on either, naming the file and line", async () => {
  const file = path.join(SRC, "kan-prompt/kan-prompt.css");
  const res = await stylelint.lint({
    cwd: ROOT,
    code: ":host {\n  color: #0ff;\n  background: var(--kan-color-cyan-500);\n}\n",
    codeFilename: file,
  });
  const f = stylelintFailures(res.results, ROOT);
  expect(f.map((x) => [x.file, x.line, x.rule]).sort((a, b) => Number(a[1]) - Number(b[1]))).toEqual([
    ["packages/components/src/components/kan-prompt/kan-prompt.css", 2, "color-no-hex"],
    ["packages/components/src/components/kan-prompt/kan-prompt.css", 3, "kan/no-primitive-tokens"],
  ]);
});

// ── CMP-003 Shadow DOM with styling hooks ───────────────

Then("every component renders into a shadow root", async (world) => {
  const o = await open(await everything());
  world.o = o;
  for (const tag of await tags()) {
    const shadows = await o.page.$$eval(tag, (els) =>
      els.map((e) => !!e.shadowRoot && e.shadowRoot.childNodes.length > 0),
    );
    expect([tag, shadows.length > 0 && shadows.every(Boolean)]).toEqual([tag, true]);
  }
});

Then("exposes its main elements as named CSS parts listed in its docs", async (world) => {
  const o = world.o as Opened;
  for (const c of (await docs()).components) {
    const used = await o.page.$$eval(c.tag, (els) => [
      ...new Set(
        els.flatMap((e) =>
          [...e.shadowRoot!.querySelectorAll("[part]")].flatMap((p) => p.getAttribute("part")!.split(" ")),
        ),
      ),
    ]);
    const documented = c.parts.map((p) => p.name).sort();
    expect([c.tag, used.sort()]).toEqual([c.tag, documented]);
    expect(documented.length).toBeGreaterThan(0);
  }
});

// ── CMP-004 Works in plain HTML ─────────────────────────

Given("a plain HTML page that loads the component bundle with one script tag", async (world) => {
  const o = await open(await everything());
  const scriptTags = await o.page.$$eval("script", (s) => s.map((x) => x.getAttribute("src")));
  expect(scriptTags).toEqual(["/build/kan.esm.js"]);
  world.o = o;
});

Then("every component renders and works on that page", async (world) => {
  const o = world.o as Opened;
  for (const tag of await tags()) {
    expect([
      tag,
      await o.page.$$eval(tag, (els) => els.length > 0 && els.every((e) => e.classList.contains("hydrated"))),
    ]).toEqual([tag, true]);
  }
  // A handle, not a locator: a locator on :not([open]) would stop matching once it opens.
  const toggle = (await o.page
    .locator("kan-tool-call:not([open])")
    .filter({ has: o.page.locator("p") })
    .first()
    .elementHandle())!;
  expect(await toggle.getAttribute("open")).toBeNull();
  await (await toggle.$("button"))!.click();
  await settle(o);
  expect(await toggle.getAttribute("open")).not.toBeNull();
});

// ── CMP-005 Pages download only what they use ──────────

Then("a page that uses two components loads code for those two and the runtime, and no others", async () => {
  const two = await open("<kan-section-heading>projects</kan-section-heading><kan-prompt>hi</kan-prompt>");
  const code = await scriptText(two);
  expect(code).toContain("rule-end");
  expect(code).toContain("@keyframes blink");
  expect(code).not.toContain("aria-controls");
  const all = await open(`<kan-tool-call name="Read"><span slot="result">x</span></kan-tool-call>`);
  expect(await scriptText(all)).toContain("aria-controls");
});

// ── CMP-006 Content lives in the page ───────────────────

Then("text a component shows is passed in through slots or attributes", async () => {
  const o = await open(await everything());
  for (const tag of await tags()) {
    for (const { attrs, texts } of await shadowTexts(o, tag)) {
      const values = Object.values(attrs);
      for (const t of texts) {
        const plain = t.replace(/^\((.*)\)$/, "$1");
        expect([tag, t, values.includes(plain)]).toEqual([tag, t, true]);
      }
    }
  }
});

Then("that text is in the page HTML before JavaScript runs", async () => {
  const o = await open(await everything(), { javaScript: false });
  const text = await o.page.evaluate(() => document.body.textContent ?? "");
  for (const phrase of [
    "who is Ian Kaneshiro?",
    "projects",
    "Software Engineer",
    "TypeScript · StencilJS · Storybook",
  ]) {
    expect([phrase, text.includes(phrase)]).toEqual([phrase, true]);
  }
});

// ── CMP-007 A typed, documented API ─────────────────────

Then("every prop, event, slot, CSS part and custom property has a type and a description", async () => {
  for (const c of (await docs()).components) {
    expect([c.tag, c.docs.length > 20]).toEqual([c.tag, true]);
    for (const p of c.props) expect([c.tag, p.name, !!p.type, p.docs.length > 5]).toEqual([c.tag, p.name, true, true]);
    for (const e of c.events)
      expect([c.tag, e.event, !!e.detail, e.docs.length > 5]).toEqual([c.tag, e.event, true, true]);
    for (const s of c.slots) expect([c.tag, s.name, s.docs.length > 5]).toEqual([c.tag, s.name, true]);
    for (const p of c.parts) expect([c.tag, p.name, p.docs.length > 3]).toEqual([c.tag, p.name, true]);
    for (const s of c.styles) expect([c.tag, s.name, s.docs.length > 5]).toEqual([c.tag, s.name, true]);
  }
});

Then("the generated docs JSON lists all of them", async () => {
  const toolCall = componentDoc(await docs(), "kan-tool-call");
  expect(toolCall.props.map((p) => p.name).sort()).toEqual(["arg", "name", "open", "status"]);
  expect(toolCall.props.find((p) => p.name === "status")!.type).toBe('"error" | "pending" | "success"');
  expect(toolCall.events.map((e) => e.event)).toEqual(["kanToggle"]);
  expect(toolCall.slots.map((s) => s.name).sort()).toEqual(["", "result"]);
  expect(toolCall.parts.map((p) => p.name).sort()).toEqual(["call", "details", "glyph", "result"]);
});

// ── CMP-008 Events are namespaced and cross the shadow boundary ─

Then("custom events are named kan followed by the action, like kanChange", async () => {
  const events = (await docs()).components.flatMap((c) => c.events);
  expect(events.length).toBeGreaterThan(0);
  for (const e of events) expect(e.event).toMatch(/^kan[A-Z][A-Za-z]+$/);
});

Then("they bubble and are composed", async () => {
  for (const e of (await docs()).components.flatMap((c) => c.events))
    expect([e.event, e.bubbles, e.composed]).toEqual([e.event, true, true]);
  const o = await open(
    `<div id="outer"><kan-tool-call name="Read" arg="x"><span slot="result">r</span><p>details</p></kan-tool-call></div>`,
  );
  await o.page.evaluate(() => {
    (window as unknown as { seen: unknown[] }).seen = [];
    document
      .getElementById("outer")!
      .addEventListener("kanToggle", (e) =>
        (window as unknown as { seen: unknown[] }).seen.push((e as CustomEvent).detail),
      );
  });
  await o.page.locator("kan-tool-call button").click();
  await settle(o);
  expect(await o.page.evaluate(() => (window as unknown as { seen: unknown[] }).seen)).toEqual([{ open: true }]);
});

// ── CMP-009 Keyboard and focus ──────────────────────────

/**
 * Every interactive component, as the element the keyboard lands on inside its shadow root.
 * `pseudo` is where the focus ring is drawn when it isn't on the element itself (kan-card draws it
 * on a::after). `hash` is where activating it goes; the others toggle.
 */
const INTERACTIVE = [
  { host: "kan-tool-call", inner: "button", tab: "BUTTON", pseudo: undefined, hash: undefined },
  { host: "kan-link", inner: "a", tab: "A", pseudo: undefined, hash: "#link" },
  { host: "kan-card", inner: "a", tab: "A", pseudo: "::after", hash: "#card" },
  { host: "kan-terminal", inner: "[part=body]", tab: "DIV", pseudo: undefined, hash: undefined },
] as const;

const interactivePage = () =>
  open(
    `<a href="#before" id="before">before</a>
<kan-tool-call name="Read" arg="x"><span slot="result">r</span><p>details</p></kan-tool-call>
<kan-tool-call name="Glob" arg="y"><span slot="result">no details, so no button</span></kan-tool-call>
<kan-link href="#link">Link</kan-link>
<kan-card href="#card"><strong slot="header">Card</strong><p>Body</p></kan-card>
<kan-terminal heading="~/ian"><pre>ls</pre></kan-terminal>`,
  );

const innerOf = (o: Opened, t: (typeof INTERACTIVE)[number]) => o.page.locator(`${t.host} ${t.inner}`);

/** Focuses the page's first link, then Tabs to the nth interactive component, as a keyboard user would. */
async function tabTo(o: Opened, n: number) {
  await o.page.locator("#before").focus();
  for (let i = 0; i <= n; i++) await o.page.keyboard.press("Tab");
  expect(await o.page.evaluate(() => document.activeElement?.tagName.toLowerCase())).toBe(INTERACTIVE[n].host);
}

const ring = (o: Opened, t: (typeof INTERACTIVE)[number]) =>
  o.page.$eval(
    t.host,
    (el, [inner, pseudo]) => {
      const target = el.shadowRoot!.querySelector(inner!)!;
      const s = getComputedStyle(target, pseudo);
      const probe = document.createElement("div");
      probe.style.color = "var(--kan-focus-ring-color)";
      document.body.append(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      return { style: s.outlineStyle, color: s.outlineColor, width: s.outlineWidth, want };
    },
    [t.inner, t.pseudo] as [string, string | undefined],
  );

Then("every interactive component is reachable by Tab", async (world) => {
  const o = await interactivePage();
  const stops: string[][] = [];
  for (let i = 0; i < INTERACTIVE.length + 1; i++) {
    await o.page.keyboard.press("Tab");
    stops.push(
      await o.page.evaluate(() => {
        const host = document.activeElement!;
        return [host.tagName.toLowerCase(), host.shadowRoot?.activeElement?.tagName ?? ""];
      }),
    );
  }
  // The page's own link first, then each component in turn; the tool call without details has no stop.
  expect(stops).toEqual([["a", ""], ...INTERACTIVE.map((t) => [t.host, t.tab])]);
  world.o = o;
});

Then("shows the focus.ring on :focus-visible only", async (world) => {
  const o = world.o as Opened;
  for (const [n, t] of INTERACTIVE.entries()) {
    await tabTo(o, n);
    const keyboard = await ring(o, t);
    expect([t.host, keyboard.style, keyboard.color, keyboard.width]).toEqual([t.host, "solid", keyboard.want, "2px"]);
    // Move focus to the page's first link, then click: a pointer focus shows no ring.
    await o.page.mouse.click(5, 5);
    await innerOf(o, t).click();
    expect([t.host, (await ring(o, t)).style]).toEqual([t.host, "none"]);
  }
});

Then("responds to Enter and Space the way its native equivalent does", async (world) => {
  const o = world.o as Opened;
  const hash = () => o.page.evaluate(() => location.hash);
  const clearHash = () => o.page.evaluate(() => history.replaceState(null, "", location.pathname + location.search));
  for (const [n, t] of INTERACTIVE.entries()) {
    if (t.host === "kan-terminal") continue; // scrolls; it has nothing to activate
    await tabTo(o, n);
    if (t.hash === undefined) {
      // A button: both keys toggle.
      const call = o.page.locator(t.host).first();
      const isOpen = async () => (await call.getAttribute("open")) !== null;
      const before = await isOpen();
      await o.page.keyboard.press("Enter");
      await settle(o);
      expect(await isOpen()).toBe(!before);
      await o.page.keyboard.press("Space");
      await settle(o);
      expect(await isOpen()).toBe(before);
      expect(
        await o.page.$eval(t.host, (el) => el.shadowRoot!.querySelector("button")!.getAttribute("aria-expanded")),
      ).toBe(String(before));
    } else {
      // A link: Enter follows it, Space doesn't.
      await clearHash();
      await o.page.keyboard.press("Space");
      await settle(o);
      expect([t.host, "Space", await hash()]).toEqual([t.host, "Space", ""]);
      await o.page.keyboard.press("Enter");
      await settle(o);
      expect([t.host, "Enter", await hash()]).toEqual([t.host, "Enter", t.hash]);
      await clearHash();
    }
  }
});

// ── CMP-010 No accessibility violations ─────────────────

Then("every story of every component passes axe with no violations in light and in dark", async () => {
  const axe = fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  const all = await stories();
  expect(all.length).toBeGreaterThan(5);
  for (const theme of ["light", "dark"] as const) {
    for (const s of all) {
      const o = await open(`<main><h1>${s.tag}</h1><h2>${s.name}</h2>${s.html}</main>`, { theme });
      await o.page.addScriptTag({ content: axe });
      const violations = await o.page.evaluate(async () => {
        const r = await (
          window as unknown as { axe: { run: () => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }
        ).axe.run();
        return r.violations.map((v) => `${v.id} (${v.nodes.length})`);
      });
      expect([theme, s.tag, s.name, violations]).toEqual([theme, s.tag, s.name, []]);
      await o.context.close();
    }
  }
});

// ── CMP-011 and KIT-007: reduced motion ─────────────────

const runningAnimations = (o: Opened) =>
  o.page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((e) => e.shadowRoot)
      .flatMap((e) =>
        e
          .shadowRoot!.getAnimations()
          .filter((a) => a.playState === "running")
          .map(() => e.tagName.toLowerCase()),
      ),
  );

Then("no component animates", async () => {
  const normal = await open(await everything());
  const reduced = await open(await everything(), { reducedMotion: true });
  expect(await runningAnimations(normal)).toContain("kan-prompt");
  expect(await runningAnimations(reduced)).toEqual([]);
});

// ── KIT-006 kan-section-heading ─────────────────────────

Then('it shows a terminal-style rule with the label inside, like "── projects ──"', async (world) => {
  const o = await open(
    `<kan-section-heading>projects</kan-section-heading><kan-section-heading level="4">work</kan-section-heading>`,
  );
  world.o = o;
  const parts = await o.page.$eval("kan-section-heading", (el) => {
    const h = el.shadowRoot!.querySelector("[part=heading]")!;
    const rules = [...h.querySelectorAll("[part=rule]")];
    const end = getComputedStyle(rules[1]);
    return { lead: rules[0].textContent, label: el.textContent, endBorder: end.borderTopStyle, endGrows: end.flexGrow };
  });
  expect(parts).toEqual({ lead: "──", label: "projects", endBorder: "solid", endGrows: "1" });
});

Then("it is a real heading, h2 unless a level is given", async (world) => {
  const o = world.o as Opened;
  expect(await o.page.getByRole("heading", { level: 2, name: "projects" }).count()).toBe(1);
  expect(await o.page.getByRole("heading", { level: 4, name: "work" }).count()).toBe(1);
});

Then("the rule characters are hidden from screen readers", async (world) => {
  const o = world.o as Opened;
  const rules = await o.page.$eval("kan-section-heading", (el) =>
    [...el.shadowRoot!.querySelectorAll("[part=rule]")].map((r) => r.getAttribute("aria-hidden")),
  );
  expect(rules).toEqual(["true", "true"]);
  // The accessible name is exactly the label: no rule characters.
  expect(await o.page.getByRole("heading", { level: 2, name: "projects", exact: true }).count()).toBe(1);
});

// ── KIT-007 kan-prompt ──────────────────────────────────

Then("it shows a prompt glyph, the slotted text and a blinking cursor", async (world) => {
  const o = await open(`<kan-prompt>who is Ian Kaneshiro?</kan-prompt>`);
  world.o = o;
  const shown = await o.page.$eval("kan-prompt", (el) => {
    const r = el.shadowRoot!;
    const cursor = r.querySelector("[part=cursor]") as HTMLElement;
    const box = cursor.getBoundingClientRect();
    return {
      glyph: r.querySelector("[part=glyph]")!.textContent,
      text: (r.querySelector("[part=text] slot") as HTMLSlotElement)
        .assignedNodes()
        .map((n) => n.textContent)
        .join(""),
      cursorVisible: box.width > 0 && box.height > 0,
      blinking: cursor.getAnimations().some((a) => (a as CSSAnimation).animationName === "blink"),
    };
  });
  expect(shown).toEqual({ glyph: ">", text: "who is Ian Kaneshiro?", cursorVisible: true, blinking: true });
});

Then("the text is in the page from the start, never typed in by script", async () => {
  const noJs = await open(`<kan-prompt>who is Ian Kaneshiro?</kan-prompt>`, { javaScript: false });
  expect(await noJs.page.textContent("kan-prompt")).toBe("who is Ian Kaneshiro?");
  const src = fs.readFileSync(path.join(SRC, "kan-prompt/kan-prompt.tsx"), "utf8");
  expect(src).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|textContent\s*=|innerHTML/);
});

Then("the cursor doesn't blink when the visitor prefers reduced motion", async () => {
  const o = await open(`<kan-prompt>hi</kan-prompt>`, { reducedMotion: true });
  const anims = await o.page.$eval(
    "kan-prompt",
    (el) => el.shadowRoot!.querySelector("[part=cursor]")!.getAnimations().length,
  );
  expect(anims).toBe(0);
});

// ── KIT-013 kan-tool-call ───────────────────────────────

Then(
  "it shows a tool call the way an agent session does: a status glyph, the tool name, a short argument and a one-line result",
  async () => {
    const o = await open(
      `<kan-tool-call name="Read" arg="profile"><span slot="result">Software Engineer</span></kan-tool-call>`,
    );
    const text = await o.page.$eval("kan-tool-call", (el) => {
      const r = el.shadowRoot!;
      const call = r.querySelector("[part=call]") as HTMLElement;
      const result = r.querySelector("[part=result]") as HTMLElement;
      const slot = result.querySelector("slot") as HTMLSlotElement;
      return {
        call: [...call.children]
          .filter((c) => !c.classList.contains("visually-hidden"))
          .map((c) => c.textContent)
          .join(" "),
        result: `${result.querySelector(".elbow")!.textContent} ${slot
          .assignedNodes()
          .map((n) => n.textContent)
          .join("")}`,
        lines: Math.round(result.getBoundingClientRect().height / parseFloat(getComputedStyle(result).lineHeight)),
      };
    });
    expect(text).toEqual({ call: "● Read (profile)", result: "⎿ Software Engineer", lines: 1 });
  },
);

Then("its details expand and collapse with the keyboard", async () => {
  const o = await open(
    `<kan-tool-call name="Read" arg="x"><span slot="result">r</span><p>the details</p></kan-tool-call>`,
  );
  const details = () =>
    o.page.$eval("kan-tool-call", (el) => !(el.shadowRoot!.querySelector("[part=details]") as HTMLElement).hidden);
  expect(await details()).toBe(false);
  await o.page.keyboard.press("Tab");
  await o.page.keyboard.press("Enter");
  await settle(o);
  expect(await details()).toBe(true);
  expect(await o.page.getByText("the details").isVisible()).toBe(true);
  await o.page.keyboard.press("Space");
  await settle(o);
  expect(await details()).toBe(false);
  const none = await open(`<kan-tool-call name="Read"><span slot="result">r</span></kan-tool-call>`);
  expect(await none.page.$eval("kan-tool-call", (el) => el.shadowRoot!.querySelector("button"))).toBeNull();
});

Then("pending, success and error states use the status tokens and a glyph, never color alone", async () => {
  const body = ["pending", "success", "error"]
    .map((s) => `<kan-tool-call status="${s}" name="Run"><span slot="result">r</span></kan-tool-call>`)
    .join("");
  const o = await open(body, { theme: "dark" });
  const seen = await o.page.$$eval("kan-tool-call", (els) =>
    els.map((el) => {
      const glyph = el.shadowRoot!.querySelector("[part=glyph]")!;
      const label = el.shadowRoot!.querySelector(".visually-hidden")!.textContent;
      const probe = (v: string) => {
        const d = document.createElement("div");
        d.style.color = `var(${v})`;
        document.body.append(d);
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      };
      return {
        status: el.getAttribute("status"),
        glyph: glyph.textContent,
        label,
        color: getComputedStyle(glyph).color,
        tokens: {
          pending: probe("--kan-color-text-subtle"),
          success: probe("--kan-color-status-success-fg"),
          error: probe("--kan-color-status-danger-fg"),
        },
      };
    }),
  );
  expect(seen.map((s) => [s.status, s.glyph, s.label])).toEqual([
    ["pending", "○", "running: "],
    ["success", "●", "done: "],
    ["error", "✗", "failed: "],
  ]);
  for (const s of seen) expect([s.status, s.color]).toEqual([s.status, s.tokens[s.status as keyof typeof s.tokens]]);
  expect(new Set(seen.map((s) => s.glyph)).size).toBe(3);
});

// ── Helpers for the display components ──────────────────

/** What a semantic token resolves to as a computed value, probed on a temporary element. */
const resolved = (o: Opened, prop: "color" | "backgroundColor" | "fontFamily", token: string) =>
  o.page.evaluate(
    ([prop, token]) => {
      const d = document.createElement("div");
      d.style[prop] = `var(${token})`;
      document.body.append(d);
      const v = getComputedStyle(d)[prop];
      d.remove();
      return v;
    },
    [prop, token] as const,
  );

// ── KIT-002 kan-link ────────────────────────────────────

Then("it renders a native link in text.accent, underlined on hover and focus", async () => {
  const o = await open(`<a href="#first">first</a> <kan-link href="#docs">Docs</kan-link>`);
  const link = o.page.getByRole("link", { name: "Docs", exact: true });
  expect(await link.count()).toBe(1);
  const style = () =>
    link.evaluate((a) => {
      const s = getComputedStyle(a);
      return { tag: a.tagName, line: s.textDecorationLine, thickness: s.textDecorationThickness, color: s.color };
    });
  const rest = await style();
  expect(rest).toEqual({
    tag: "A",
    line: "underline",
    thickness: "1px",
    color: await resolved(o, "color", "--kan-color-text-accent"),
  });
  expect(await link.getAttribute("href")).toBe("#docs");
  await link.hover();
  expect(await style()).toEqual({ ...rest, thickness: "2px" });
  await o.page.mouse.move(400, 400);
  expect((await style()).thickness).toBe("1px");
  await o.page.keyboard.press("Tab"); // first
  await o.page.keyboard.press("Tab"); // Docs
  expect(await style()).toEqual({ ...rest, thickness: "2px" });
});

Then(
  'when it opens a new tab it adds rel="noopener noreferrer", an external icon and an accessible "opens in a new tab" hint',
  async () => {
    const o = await open(
      `<kan-link id="out" href="https://example.com" target="_blank">Docs</kan-link><kan-link id="in" href="#docs">Docs</kan-link>`,
    );
    const out = o.page.locator("#out a");
    const inside = o.page.locator("#in a");
    expect(await out.getAttribute("target")).toBe("_blank");
    expect(await out.getAttribute("rel")).toBe("noopener noreferrer");
    expect(
      await o.page
        .locator("#out kan-icon.external")
        .evaluateAll((els) => els.map((e) => (e as HTMLElement & { name: string }).name)),
    ).toEqual(["external"]);
    // The icon is decoration; the hint is what assistive tech reads, as part of the link's name.
    expect(await o.page.locator("#out kan-icon").getAttribute("aria-hidden")).toBe("true");
    expect(await o.page.getByRole("link", { name: "Docs (opens in a new tab)", exact: true }).count()).toBe(1);
    // A link in the same tab has none of it.
    expect(await inside.getAttribute("rel")).toBeNull();
    expect(await inside.getAttribute("target")).toBeNull();
    expect(await o.page.locator("#in kan-icon").count()).toBe(0);
    expect(await o.page.getByRole("link", { name: "Docs", exact: true }).count()).toBe(1);
  },
);

// ── KIT-003 kan-tag ─────────────────────────────────────

Then("it shows a short mono label, like a technology name, with an optional leading icon", async () => {
  const o = await open(`<kan-tag id="plain">TypeScript</kan-tag><kan-tag id="icon" icon="github">Git</kan-tag>`);
  const mono = await resolved(o, "fontFamily", "--kan-typography-label-font-family");
  expect(mono).toMatch(/mono/i);
  const seen = await o.page.$$eval("kan-tag", (els) =>
    els.map((el) => {
      const tag = el.shadowRoot!.querySelector("[part=tag]")!;
      const icon = tag.querySelector("[part=icon]");
      const slot = tag.querySelector("slot")!;
      return {
        text: el.textContent,
        font: getComputedStyle(tag).fontFamily,
        icon: icon ? (icon as HTMLElement & { name: string }).name : null,
        // The icon comes before the label.
        before: icon ? !!(icon.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
      };
    }),
  );
  expect(seen).toEqual([
    { text: "TypeScript", font: mono, icon: null, before: null },
    { text: "Git", font: mono, icon: "github", before: true },
  ]);
});

Then("it isn't interactive", async () => {
  const o = await open(`<a href="#a">a</a><kan-tag icon="github">React</kan-tag><a href="#b">b</a>`);
  await o.page.keyboard.press("Tab");
  await o.page.keyboard.press("Tab");
  // Tab skips the tag: the second stop is the link after it.
  expect(await o.page.evaluate(() => document.activeElement?.getAttribute("href"))).toBe("#b");
  const inert = await o.page.$eval("kan-tag", (el) => ({
    host: el.hasAttribute("tabindex") || el.hasAttribute("role"),
    focusable: el.shadowRoot!.querySelectorAll("a[href], button, input, select, textarea, [tabindex], [role]").length,
  }));
  expect(inert).toEqual({ host: false, focusable: 0 });
  for (const role of ["link", "button"] as const)
    expect(await o.page.getByRole(role, { name: "React" }).count()).toBe(0);
});

// ── KIT-004 kan-card ────────────────────────────────────

Then("it is a bg.surface container with optional header and footer slots", async () => {
  const o = await open(
    `<kan-card id="full"><strong slot="header">Title</strong><p>Body</p><span slot="footer">Footer</span></kan-card>
<kan-card id="bare"><p>Only a body</p></kan-card>`,
  );
  const surface = await resolved(o, "backgroundColor", "--kan-color-bg-surface");
  const seen = await o.page.$$eval("kan-card", (els) =>
    els.map((el) => {
      const r = el.shadowRoot!;
      const assigned = (sel: string) =>
        (r.querySelector(sel) as HTMLSlotElement).assignedNodes().map((n) => n.textContent);
      return {
        bg: getComputedStyle(r.querySelector("[part=card]")!).backgroundColor,
        header: assigned("slot[name=header]"),
        body: assigned("[part=body] slot"),
        footer: assigned("slot[name=footer]"),
      };
    }),
  );
  expect(seen).toEqual([
    { bg: surface, header: ["Title"], body: ["Body"], footer: ["Footer"] },
    { bg: surface, header: [], body: ["Only a body"], footer: [] },
  ]);
});

/** Every anchor in the composed tree, with whether another anchor is among its ancestors. */
const nestedAnchors = (o: Opened) =>
  o.page.evaluate(() => {
    const anchors: Element[] = [];
    const collect = (root: ParentNode) => {
      root.querySelectorAll("*").forEach((e) => {
        if (e.tagName === "A") anchors.push(e);
        if (e.shadowRoot) collect(e.shadowRoot);
      });
    };
    collect(document);
    // The parent in the flattened tree: the slot a node is assigned to, or a shadow root's host.
    const parent = (n: Node): Node | null =>
      (n as Element).assignedSlot ?? (n.parentNode instanceof ShadowRoot ? n.parentNode.host : n.parentNode);
    return anchors.map((a) => {
      for (let p = parent(a); p; p = parent(p)) if ((p as Element).tagName === "A") return "nested";
      return "ok";
    });
  });

Then("when href is set the whole card is clickable through a single link, never nested links", async () => {
  const o = await open(
    `<kan-card href="#card"><strong slot="header">Title</strong><p>Body text</p><kan-link slot="footer" href="#footer">Footer link</kan-link></kan-card>
<kan-card><strong slot="header">No link</strong><p>Plain</p></kan-card>`,
  );
  // One link around the card, one for the footer's own link, none on the card without an href.
  expect(
    await o.page
      .locator("kan-card")
      .first()
      .evaluate((el) => el.shadowRoot!.querySelectorAll("a").length),
  ).toBe(1);
  expect(
    await o.page
      .locator("kan-card")
      .nth(1)
      .evaluate((el) => el.shadowRoot!.querySelectorAll("a").length),
  ).toBe(0);
  expect(await nestedAnchors(o)).toEqual(["ok", "ok"]);
  const hash = () => o.page.evaluate(() => location.hash);
  // A click on the body, away from any link text, follows the card's link.
  const body = (await o.page.getByText("Body text").boundingBox())!;
  const card = (await o.page.locator("kan-card").first().boundingBox())!;
  await o.page.mouse.click(body.x + body.width / 2, body.y + body.height / 2);
  expect(await hash()).toBe("#card");
  // The footer's link goes to its own href.
  await o.page.getByRole("link", { name: "Footer link", exact: true }).click();
  expect(await hash()).toBe("#footer");
  // Anywhere on the card, such as the bottom-right corner, follows the card's link again.
  await o.page.mouse.click(card.x + card.width - 3, card.y + card.height - 3);
  expect(await hash()).toBe("#card");
  // The card's link is named by its header.
  expect(await o.page.getByRole("link", { name: "Title", exact: true }).count()).toBe(1);
});

// ── KIT-005 kan-project-card ────────────────────────────

const projectCard = (links: string) => `<kan-project-card name="KanDiscer">
  A web app that helps disc golfers improve their game.
  <kan-tag slot="stack">React</kan-tag>
  <kan-tag slot="stack">Python</kan-tag>
  ${links}
</kan-project-card>`;
const source = `<kan-link slot="links" href="https://github.com/IanKaneshiro/KanDiscer" target="_blank">Source</kan-link>`;
const demo = `<kan-link slot="links" href="https://example.com/demo" target="_blank">Live demo</kan-link>`;

Then("it shows a project's name, one-line summary and stack tags", async () => {
  const o = await open(projectCard(source));
  expect(await o.page.getByRole("heading", { level: 3, name: "KanDiscer", exact: true }).count()).toBe(1);
  const seen = await o.page.$eval("kan-project-card", (el) => {
    const r = el.shadowRoot!;
    const assigned = (sel: string) =>
      (r.querySelector(sel) as HTMLSlotElement).assignedNodes().map((n) => n.textContent!.trim());
    return {
      summary: assigned("[part=summary] slot").join(""),
      stack: (r.querySelector("[part=stack] slot") as HTMLSlotElement).assignedElements().map((e) => e.textContent),
    };
  });
  expect(seen.summary).toBe("A web app that helps disc golfers improve their game.");
  expect(seen.stack).toEqual(["React", "Python"]);
});

Then("links to its source, and to its live demo when there is one", async () => {
  const both = await open(projectCard(source + demo));
  const href = (o: Opened, name: string) => o.page.getByRole("link", { name, exact: true }).getAttribute("href");
  expect(await href(both, "Source (opens in a new tab)")).toBe("https://github.com/IanKaneshiro/KanDiscer");
  expect(await href(both, "Live demo (opens in a new tab)")).toBe("https://example.com/demo");
  const sourceOnly = await open(projectCard(source));
  expect(await sourceOnly.page.getByRole("link", { name: "Source (opens in a new tab)", exact: true }).count()).toBe(1);
  expect(await sourceOnly.page.getByRole("link", { name: /demo/i }).count()).toBe(0);
});

Then("it is built from kan-card, kan-tag and kan-link", async () => {
  const o = await open(projectCard(source + demo));
  const seen = await o.page.$eval("kan-project-card", (el) => {
    const card = el.shadowRoot!.querySelector("kan-card")!;
    // Whether `node` sits inside `card` in the flattened tree: through slots and shadow roots.
    const flatParent = (n: Node): Node | null =>
      (n as Element).assignedSlot ?? (n.parentNode instanceof ShadowRoot ? n.parentNode.host : n.parentNode);
    const within = (n: Node) => {
      for (let p = flatParent(n); p; p = flatParent(p)) if (p === card) return true;
      return false;
    };
    const used = (tag: string) =>
      [...el.querySelectorAll(tag)].map((e) => [e.classList.contains("hydrated"), within(e)]);
    return {
      card: customElements.get("kan-card") !== undefined && card.classList.contains("hydrated"),
      name: within(el.shadowRoot!.querySelector("[part=name]")!),
      tags: used("kan-tag"),
      links: used("kan-link"),
    };
  });
  expect(seen).toEqual({
    card: true,
    name: true,
    tags: [
      [true, true],
      [true, true],
    ],
    links: [
      [true, true],
      [true, true],
    ],
  });
});

// ── KIT-008 kan-terminal ────────────────────────────────

const terminal = (lines: string) => `<kan-terminal heading="~/ian">
  <kan-prompt cursor="false">whoami</kan-prompt>
  ${lines}
</kan-terminal>`;

Then("it is a framed window on bg.inset with a title bar and a title", async () => {
  const o = await open(terminal("<pre>Ian Kaneshiro</pre>"));
  const seen = await o.page.$eval("kan-terminal", (el) => {
    const r = el.shadowRoot!;
    const window = r.querySelector("[part=window]")!;
    const bar = r.querySelector("[part=titlebar]")!;
    const title = r.querySelector("[part=title]")!;
    const body = r.querySelector("[part=body]")!;
    const w = getComputedStyle(window);
    const barBox = bar.getBoundingClientRect();
    return {
      frame: [w.borderTopStyle, w.borderTopWidth],
      bg: w.backgroundColor,
      title: title.textContent,
      titleInBar: bar.contains(title) && title.getBoundingClientRect().bottom <= barBox.bottom,
      barAboveBody: barBox.bottom <= body.getBoundingClientRect().top,
    };
  });
  expect(seen).toEqual({
    frame: ["solid", "1px"],
    bg: await resolved(o, "backgroundColor", "--kan-color-bg-inset"),
    title: "~/ian",
    titleInBar: true,
    barAboveBody: true,
  });
});

Then("shows slotted commands and output in the mono family", async () => {
  const o = await open(terminal("<pre>Ian Kaneshiro, software engineer</pre>"));
  const mono = await resolved(o, "fontFamily", "--kan-typography-code-font-family");
  expect(mono).toMatch(/mono/i);
  expect(await o.page.getByText("whoami").isVisible()).toBe(true);
  expect(await o.page.getByText("Ian Kaneshiro, software engineer").isVisible()).toBe(true);
  const fonts = await o.page.evaluate(() => [
    getComputedStyle(document.querySelector("kan-terminal pre")!).fontFamily,
    getComputedStyle(document.querySelector("kan-prompt")!.shadowRoot!.querySelector("[part=text]")!).fontFamily,
  ]);
  expect(fonts).toEqual([mono, mono]);
});

Then("long lines scroll inside the window instead of widening the page", async () => {
  const o = await open(terminal(`<pre>${"x".repeat(300)}</pre>`), { viewport: { width: 360, height: 640 } });
  const seen = await o.page.evaluate(async () => {
    const host = document.querySelector("kan-terminal")!;
    const body = host.shadowRoot!.querySelector("[part=body]") as HTMLElement;
    const before = { client: body.clientWidth, scroll: body.scrollWidth };
    body.scrollLeft = 100;
    return {
      overflowX: getComputedStyle(body).overflowX,
      scrollsInside: before.scroll > before.client,
      scrolled: body.scrollLeft > 0,
      pageScrollWidth: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      hostWidth: host.getBoundingClientRect().width,
    };
  });
  expect(seen.viewport).toBe(360);
  expect(seen.overflowX).toBe("auto");
  expect(seen.scrollsInside).toBe(true);
  expect(seen.scrolled).toBe(true);
  expect(seen.pageScrollWidth).toBeLessThanOrEqual(360);
  expect(seen.hostWidth).toBeLessThanOrEqual(360);
});

// ── KIT-012 kan-icon ────────────────────────────────────

Then(
  "it draws icons from one SVG set: github, linkedin, mail, external, sun, moon, monitor, terminal, menu and close",
  async () => {
    const names = "github linkedin mail external sun moon monitor terminal menu close".split(" ");
    const typed = componentDoc(await docs(), "kan-icon").props.find((p) => p.name === "name")!;
    expect([...typed.type.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()).toEqual([...names].sort());
    const o = await open(names.map((n) => `<kan-icon name="${n}"></kan-icon>`).join(""));
    const drawn = await o.page.$$eval("kan-icon", (els) =>
      els.map((el) => {
        const path = el.shadowRoot!.querySelector("svg path") as SVGPathElement;
        const b = path.getBBox();
        return { name: el.getAttribute("name"), d: path.getAttribute("d"), size: b.width > 0 && b.height > 0 };
      }),
    );
    expect(drawn.map((d) => d.name)).toEqual(names);
    expect(drawn.every((d) => d.size)).toBe(true);
    // Each name draws its own shape.
    expect(new Set(drawn.map((d) => d.d)).size).toBe(names.length);
    // They are one set: the same 24px grid and line style.
    const svgs = await o.page.$$eval("kan-icon", (els) =>
      els.map((el) => {
        const svg = el.shadowRoot!.querySelector("svg")!;
        return [svg.getAttribute("viewBox"), svg.getAttribute("stroke"), svg.getAttribute("stroke-width")].join("|");
      }),
    );
    expect([...new Set(svgs)]).toEqual(["0 0 24 24|currentColor|1.5"]);
  },
);

Then("an icon is hidden from assistive tech unless it is given a label", async () => {
  const o = await open(
    `<kan-icon id="plain" name="github"></kan-icon><kan-icon id="named" name="github" label="GitHub"></kan-icon>
<button id="a"><kan-icon name="close"></kan-icon></button><button id="b"><kan-icon name="close" label="Close"></kan-icon></button>`,
  );
  const attrs = (id: string) =>
    o.page.$eval(id, (el) => ({
      hidden: el.getAttribute("aria-hidden"),
      role: el.getAttribute("role"),
      label: el.getAttribute("aria-label"),
    }));
  expect(await attrs("#plain")).toEqual({ hidden: "true", role: null, label: null });
  expect(await attrs("#named")).toEqual({ hidden: null, role: "img", label: "GitHub" });
  // Only the labelled icon is in the accessibility tree.
  expect(await o.page.locator("kan-icon:not([aria-hidden=true])").count()).toBe(2);
  expect(await o.page.getByRole("img", { name: "GitHub", exact: true }).count()).toBe(1);
  // And it names a button that has nothing else to say; the decoration doesn't.
  expect(await o.page.getByRole("button", { name: "Close", exact: true }).count()).toBe(1);
  expect(await o.page.getByRole("button", { name: "", exact: true }).count()).toBe(1);
});

// ── KIT-014 kan-plan ────────────────────────────────────

const plan = `<kan-plan>
  <kan-plan-step state="done">The spec graph</kan-plan-step>
  <kan-plan-step state="in-progress">The component library</kan-plan-step>
  <kan-plan-step state="pending">The site</kan-plan-step>
</kan-plan>`;

Then("it shows an ordered checklist of steps, each done, in progress or pending", async () => {
  const o = await open(plan);
  expect(await o.page.getByRole("list").count()).toBe(1);
  expect(await o.page.getByRole("listitem").count()).toBe(3);
  const seen = await o.page.$eval("kan-plan", (el) => {
    const list = el.shadowRoot!.querySelector("[part=list]")!;
    return [...el.querySelectorAll("kan-plan-step")].map((s) => ({
      state: s.getAttribute("state"),
      text: s.textContent,
      role: s.getAttribute("role"),
      // Each step is slotted into the list, in order.
      inList: s.assignedSlot?.parentElement === list,
    }));
  });
  expect(seen).toEqual([
    { state: "done", text: "The spec graph", role: "listitem", inList: true },
    { state: "in-progress", text: "The component library", role: "listitem", inList: true },
    { state: "pending", text: "The site", role: "listitem", inList: true },
  ]);
});

Then("each step's state is shown by a glyph and announced as text, never by color alone", async () => {
  const o = await open(plan);
  const steps = await o.page.$$eval("kan-plan-step", (els) =>
    els.map((el) => {
      const r = el.shadowRoot!;
      const glyph = r.querySelector("[part=glyph]")!;
      const hidden = r.querySelector(".visually-hidden") as HTMLElement;
      const box = hidden.getBoundingClientRect();
      return {
        glyph: glyph.textContent,
        glyphHidden: glyph.getAttribute("aria-hidden"),
        announced: hidden.textContent,
        // The text is for assistive tech only: it takes no room on screen.
        visible: box.width > 1 || box.height > 1,
        clipped: getComputedStyle(hidden).clipPath,
      };
    }),
  );
  expect(steps.map((s) => [s.glyph, s.announced])).toEqual([
    ["[x]", "done: "],
    ["[~]", "in progress: "],
    ["[ ]", "not started: "],
  ]);
  expect(new Set(steps.map((s) => s.glyph)).size).toBe(3);
  expect(new Set(steps.map((s) => s.announced)).size).toBe(3);
  for (const s of steps) expect([s.glyphHidden, s.visible, s.clipped]).toEqual(["true", false, "inset(50%)"]);
  // What a screen reader gets for each step: the state in words, then the step.
  const tree = await o.page.locator("kan-plan").ariaSnapshot();
  for (const line of ["done: The spec graph", "in progress: The component library", "not started: The site"])
    expect(tree).toContain(line);
});

// ── THEME-008 Components follow the theme ───────────────

When("the theme changes", async (world) => {
  const read = async (theme: "light" | "dark") => {
    const o = await open(`<kan-prompt>hi</kan-prompt><kan-section-heading>work</kan-section-heading>`, { theme });
    return o.page.evaluate(() => ({
      glyph: getComputedStyle(document.querySelector("kan-prompt")!.shadowRoot!.querySelector("[part=glyph]")!).color,
      label: getComputedStyle(
        document.querySelector("kan-section-heading")!.shadowRoot!.querySelector("[part=heading]")!,
      ).color,
    }));
  };
  world.light = await read("light");
  world.dark = await read("dark");
});

Then("every kan- component, including what's inside its shadow root, changes with the page", (world) => {
  const [light, dark] = [world.light as Record<string, string>, world.dark as Record<string, string>];
  expect(light.glyph).not.toBe(dark.glyph);
  expect(light.label).not.toBe(dark.label);
});

// ── DOCS-001 and DOCS-003: stories and API docs ─────────

Then("every component has a story for each variant, size and state it supports", async () => {
  const all = await stories();
  for (const c of (await docs()).components) {
    // Every story that shows the component, not only its own: kan-icon and kan-plan-step appear in others'.
    const html = all
      .filter((s) => new RegExp(`<${c.tag}[\\s>/]`).test(s.html))
      .map((s) => s.html)
      .join("\n");
    expect([c.tag, html.length > 0]).toEqual([c.tag, true]);
    for (const p of c.props) {
      const attr = p.attr ?? p.name;
      const literals = [...p.type.matchAll(/"([^"]+)"|\b(\d+)\b/g)].map((m) => m[1] ?? m[2]);
      if (p.type.includes("|")) {
        for (const v of literals) {
          const shown =
            html.includes(`${attr}="${v}"`) ||
            (p.default === JSON.stringify(v) || p.default === v ? html.includes(`<${c.tag}`) : false);
          expect([c.tag, attr, v, shown]).toEqual([c.tag, attr, v, true]);
        }
      }
      if (p.type === "boolean") {
        const on =
          p.default === "true"
            ? html.includes(`<${c.tag}`)
            : new RegExp(`<${c.tag}[^>]*\\s${attr}(\\s|>|=)`).test(html);
        const off =
          p.default === "true"
            ? html.includes(`${attr}="false"`)
            : new RegExp(`<${c.tag}(?![^>]*\\s${attr}[\\s>=])[^>]*>`).test(html);
        expect([c.tag, attr, on, off]).toEqual([c.tag, attr, true, true]);
      }
    }
  }
});

Then("each component's docs page lists its props, events, slots, CSS parts and custom properties", async () => {
  for (const c of (await docs()).components) {
    const html = renderApi(c as ComponentDoc);
    for (const section of ["props", "events", "slots", "css parts", "css custom properties"]) {
      const listed = {
        props: c.props,
        events: c.events,
        slots: c.slots,
        "css parts": c.parts,
        "css custom properties": c.styles,
      }[section]!;
      if (listed.length)
        expect([c.tag, section, html.includes(`data-api="${section}"`)]).toEqual([c.tag, section, true]);
    }
    for (const p of c.props) expect(html).toContain(p.docs.replace(/"/g, "&quot;"));
    for (const p of c.parts) expect(html).toContain(`<code>${p.name}</code>`);
    for (const e of c.events) expect(html).toContain(`<code>${e.event}</code>`);
  }
});

Then("the lists are generated from the Stencil docs JSON, not written by hand", async () => {
  for (const tag of await tags()) {
    const stories = fs.readFileSync(path.join(SRC, tag, `${tag}.stories.ts`), "utf8");
    expect(stories).toContain(`export const Api = apiStory("${tag}");`);
  }
  const api = fs.readFileSync(path.join(COMPONENTS, "src/docs/api.ts"), "utf8");
  expect(api).toContain('await import("@kan/components/docs.json")');
  const doc = componentDoc(await docs(), "kan-prompt");
  const changed = {
    ...doc,
    props: [...doc.props, { name: "made-up", type: "string", docs: "A prop that only exists in this test." }],
  };
  expect(renderApi(changed)).toContain("A prop that only exists in this test.");
});
