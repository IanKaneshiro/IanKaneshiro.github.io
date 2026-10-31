import { expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import stylelint from "stylelint";
import { stylelintFailures } from "../../tools/gate/checks";
import { componentDoc, renderApi, type ComponentDoc, type DocsJson } from "../../packages/components/src/docs/api";
import { ensureBuilt, open, scriptText, settle, type Opened } from "../support/browser";
import { loadScenarios } from "../support/gherkin";
import { Given, steps, Then, When, type World } from "../support/steps";

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
  { host: "kan-button", inner: "button", tab: "BUTTON", pseudo: undefined, hash: undefined },
  { host: "kan-theme-toggle", inner: "button", tab: "BUTTON", pseudo: undefined, hash: undefined },
  // The header's menu button only exists below 768px, so the page is opened at a phone's width.
  { host: "kan-site-header", inner: ".menu-button", tab: "BUTTON", pseudo: undefined, hash: undefined },
] as const;

/** The header's own theme toggle is a second stop inside kan-site-header, after its menu button. */
const HEADER_TOGGLE_STOP = ["kan-site-header", "KAN-THEME-TOGGLE"];

const interactivePage = () =>
  open(
    `<a href="#before" id="before">before</a>
<kan-tool-call name="Read" arg="x"><span slot="result">r</span><p>details</p></kan-tool-call>
<kan-tool-call name="Glob" arg="y"><span slot="result">no details, so no button</span></kan-tool-call>
<kan-link href="#link">Link</kan-link>
<kan-card href="#card"><strong slot="header">Card</strong><p>Body</p></kan-card>
<kan-terminal heading="~/ian"><pre>ls</pre></kan-terminal>
<kan-button>Button</kan-button>
<kan-theme-toggle></kan-theme-toggle>
<kan-site-header><span slot="brand">Ian Kaneshiro</span></kan-site-header>`,
    { viewport: { width: 375, height: 800 } },
  );

/** The first match: a page can hold the same component twice (the header has its own theme toggle). */
const innerOf = (o: Opened, t: (typeof INTERACTIVE)[number]) => o.page.locator(`${t.host} ${t.inner}`).first();

/** Focuses the page's first link, then Tabs to the nth interactive component, as a keyboard user would. */
async function tabTo(o: Opened, n: number) {
  await o.page.locator("#before").focus();
  for (let i = 0; i <= n; i++) await o.page.keyboard.press("Tab");
  expect(await o.page.evaluate(() => document.activeElement?.tagName.toLowerCase())).toBe(INTERACTIVE[n].host);
}

const ring = (o: Opened, t: (typeof INTERACTIVE)[number]) =>
  innerOf(o, t).evaluate((target, pseudo) => {
    const s = getComputedStyle(target, pseudo);
    const probe = document.createElement("div");
    probe.style.color = "var(--kan-focus-ring-color)";
    document.body.append(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return { style: s.outlineStyle, color: s.outlineColor, width: s.outlineWidth, want };
  }, t.pseudo);

Then("every interactive component is reachable by Tab", async (world) => {
  const o = await interactivePage();
  const stops: string[][] = [];
  for (let i = 0; i < INTERACTIVE.length + 2; i++) {
    await o.page.keyboard.press("Tab");
    stops.push(
      await o.page.evaluate(() => {
        const host = document.activeElement!;
        return [host.tagName.toLowerCase(), host.shadowRoot?.activeElement?.tagName ?? ""];
      }),
    );
  }
  // The page's own link first, then each component in turn; the tool call without details has no stop.
  expect(stops).toEqual([["a", ""], ...INTERACTIVE.map((t) => [t.host, t.tab]), HEADER_TOGGLE_STOP]);
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
  // Every click that reaches the document, by the host it came from.
  await o.page.evaluate(() => {
    const w = window as unknown as { clicked: string[] };
    w.clicked = [];
    document.addEventListener("click", (e) => w.clicked.push((e.target as Element).localName));
  });
  const clicks = (host: string) =>
    o.page.evaluate((h) => (window as unknown as { clicked: string[] }).clicked.filter((c) => c === h).length, host);
  for (const [n, t] of INTERACTIVE.entries()) {
    if (t.host === "kan-terminal") continue; // scrolls; it has nothing to activate
    await tabTo(o, n);
    if (t.hash === undefined) {
      // A button: both keys activate it, and what it toggles flips each time.
      const expanded = () => innerOf(o, t).getAttribute("aria-expanded");
      const before = await expanded();
      const clicksBefore = await clicks(t.host);
      await o.page.keyboard.press("Enter");
      await settle(o);
      expect([t.host, "Enter", await clicks(t.host)]).toEqual([t.host, "Enter", clicksBefore + 1]);
      if (before !== null) expect(await expanded()).toBe(String(before !== "true"));
      await o.page.keyboard.press("Space");
      await settle(o);
      expect([t.host, "Space", await clicks(t.host)]).toEqual([t.host, "Space", clicksBefore + 2]);
      if (before !== null) expect(await expanded()).toBe(before);
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

// ── Helpers for the interactive components ──────────────

/** The computed color a semantic token resolves to, as a CSS property on a probe (so oklch and rgb compare equal). */
const tokenColor = (o: Opened, token: string) =>
  o.page.evaluate((v) => {
    const probe = document.createElement("div");
    probe.style.color = `var(${v})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, token);

/** The styles a kan-button's inner element is painted with. */
const buttonLook = (o: Opened, selector: string) =>
  o.page.locator(selector).evaluate((host) => {
    const s = getComputedStyle(host.shadowRoot!.querySelector("[part=button]")!);
    return {
      background: s.backgroundColor,
      color: s.color,
      border: s.borderTopColor,
      borderWidth: s.borderTopWidth,
      height: host.getBoundingClientRect().height,
    };
  });

// ── KIT-001 kan-button ──────────────────────────────────

Then("it has primary, secondary and ghost variants and sm and md sizes", async (world) => {
  const o = await open(
    `<kan-button id="primary" variant="primary">Primary</kan-button>
<kan-button id="secondary" variant="secondary">Secondary</kan-button>
<kan-button id="ghost" variant="ghost">Ghost</kan-button>
<kan-button id="sm" size="sm">Small</kan-button>
<kan-button id="md" size="md">Medium</kan-button>
<kan-button id="default">Default</kan-button>`,
    { theme: "light" },
  );
  world.o = o;
  const token = (t: string) => tokenColor(o, `--kan-color-${t}`);
  const primary = await buttonLook(o, "#primary");
  expect([primary.background, primary.color]).toEqual([await token("accent-default"), await token("text-on-accent")]);
  const secondary = await buttonLook(o, "#secondary");
  expect([secondary.background, secondary.color, secondary.border, secondary.borderWidth]).toEqual([
    await token("bg-surface"),
    await token("text-default"),
    await token("border-strong"),
    "1px",
  ]);
  const ghost = await buttonLook(o, "#ghost");
  expect([ghost.background, ghost.color]).toEqual(["rgba(0, 0, 0, 0)", await token("text-accent")]);
  // Hover shifts a primary to accent.hover.
  await o.page.locator("#primary").hover();
  expect((await buttonLook(o, "#primary")).background).toBe(await token("accent-hover"));
  await o.page.mouse.move(0, 0);
  // Variant and size default to primary and md.
  expect(await buttonLook(o, "#default")).toEqual(await buttonLook(o, "#md"));
  expect((await buttonLook(o, "#default")).background).toBe(primary.background);
  expect((await buttonLook(o, "#sm")).height).toBeLessThan((await buttonLook(o, "#md")).height);
  // The focus ring shows for the keyboard only.
  await o.page.keyboard.press("Tab");
  const ringOf = (id: string) =>
    o.page
      .locator(`#${id}`)
      .evaluate((h) => getComputedStyle(h.shadowRoot!.querySelector("[part=button]")!).outlineStyle);
  expect(await ringOf("primary")).toBe("solid");
  await o.page.mouse.click(5, 5);
  await o.page.locator("#secondary").click();
  expect(await ringOf("secondary")).toBe("none");
});

Then("renders a native button, or a native link when href is set", async () => {
  const o = await open(
    `<form id="form"><kan-button id="plain">Plain</kan-button><kan-button id="send" type="submit">Send</kan-button><kan-button id="disabled-send" type="submit" disabled>Off</kan-button></form>
<kan-button id="link" href="#target" variant="secondary">Link</kan-button>`,
  );
  const tags = await o.page.$$eval("kan-button", (els) =>
    els.map((e) => {
      const inner = e.shadowRoot!.querySelector("[part=button]")!;
      return [e.id, inner.localName, inner.getAttribute("href"), inner.getAttribute("type")];
    }),
  );
  expect(tags).toEqual([
    ["plain", "button", null, "button"],
    ["send", "button", null, "button"],
    ["disabled-send", "button", null, "button"],
    ["link", "a", "#target", null],
  ]);
  // The native roles are what assistive tech gets.
  expect(await o.page.getByRole("button", { name: "Plain" }).count()).toBe(1);
  expect(await o.page.getByRole("link", { name: "Link" }).count()).toBe(1);
  // A link follows its href; type="submit" submits the form around it; type="button" doesn't.
  await o.page.evaluate(() => {
    const w = window as unknown as { submits: number };
    w.submits = 0;
    document.getElementById("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      w.submits++;
    });
  });
  const submits = () => o.page.evaluate(() => (window as unknown as { submits: number }).submits);
  await o.page.locator("#plain").click();
  await o.page.locator("#disabled-send").click({ force: true });
  expect(await submits()).toBe(0);
  await o.page.locator("#send").click();
  expect(await submits()).toBe(1);
  await o.page.locator("#link").click();
  expect(await o.page.evaluate(() => location.hash)).toBe("#target");
});

Then("a disabled button can't be activated and says so to assistive tech", async () => {
  const o = await open(
    `<kan-button id="off" disabled>Off</kan-button>
<kan-button id="off-link" href="#nowhere" disabled>Off link</kan-button>
<kan-button id="on">On</kan-button>`,
  );
  await o.page.evaluate(() => {
    const w = window as unknown as { clicked: string[] };
    w.clicked = [];
    document.addEventListener("click", (e) => w.clicked.push((e.target as Element).id));
    document.getElementById("off")!.addEventListener("click", () => w.clicked.push("off-listener"));
    document.getElementById("off-link")!.addEventListener("click", () => w.clicked.push("off-link-listener"));
  });
  const clicked = () => o.page.evaluate(() => (window as unknown as { clicked: string[] }).clicked);
  // Said to assistive tech: a native disabled button, and a link marked aria-disabled.
  const off = await o.page.$eval("#off", (e) => e.shadowRoot!.querySelector("button")!.disabled);
  expect(off).toBe(true);
  expect(await o.page.getByRole("button", { name: "Off" }).isDisabled()).toBe(true);
  expect(await o.page.getByRole("button", { name: "On" }).isDisabled()).toBe(false);
  const link = await o.page.$eval("#off-link", (e) => {
    const a = e.shadowRoot!.querySelector("[part=button]")!;
    return {
      tag: a.localName,
      href: a.getAttribute("href"),
      aria: a.getAttribute("aria-disabled"),
      tabindex: a.getAttribute("tabindex"),
    };
  });
  expect(link).toEqual({ tag: "a", href: null, aria: "true", tabindex: null });
  expect(await o.page.getByRole("link", { name: "Off link" }).getAttribute("aria-disabled")).toBe("true");
  // Not activated: pointer clicks do nothing, and the keyboard can't reach it.
  await o.page.locator("#off").click({ force: true });
  await o.page.locator("#off-link").click({ force: true });
  expect(await o.page.evaluate(() => location.hash)).toBe("");
  const stops: string[] = [];
  for (let i = 0; i < 3; i++) {
    await o.page.keyboard.press("Tab");
    stops.push(await o.page.evaluate(() => document.activeElement?.id ?? ""));
  }
  expect(stops.filter((id) => id.startsWith("off"))).toEqual([]);
  expect(stops[0]).toBe("on");
  await o.page.keyboard.press("Enter");
  await o.page.keyboard.press("Space");
  expect((await clicked()).filter((c) => c.startsWith("off"))).toEqual([]);
  // The enabled one still works, so the test could have seen a click.
  expect((await clicked()).filter((c) => c === "on")).toEqual(["on", "on"]);
});

// ── KIT-009, THEME-002, THEME-003, THEME-006: the theme toggle ──

const TOGGLE = `<kan-theme-toggle></kan-theme-toggle>`;
const toggleButton = (o: Opened) => o.page.locator("kan-theme-toggle button");
const toggleName = async (o: Opened) => (await toggleButton(o).getAttribute("aria-label")) ?? "";
const dataTheme = (o: Opened) => o.page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const savedTheme = (o: Opened) => o.page.evaluate(() => localStorage.getItem("kan-theme"));
const canvas = (o: Opened) => o.page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** Presses the toggle until it names `theme`, at most once around the cycle. */
async function chooseTheme(o: Opened, theme: "Light" | "Dark" | "System") {
  for (let i = 0; i < 3 && (await toggleName(o)) !== `Theme: ${theme}`; i++) {
    await toggleButton(o).click();
    await settle(o);
  }
  expect(await toggleName(o)).toBe(`Theme: ${theme}`);
}

When("I choose dark with the theme toggle", async (world) => {
  // Light mode system, so a page that turned dark did it because of the toggle.
  const o = await open(TOGGLE);
  world.before = await canvas(o);
  world.o = o;
  await chooseTheme(o, "Dark");
});

Then("the page turns dark right away", async (world) => {
  const o = world.o as Opened;
  expect(await dataTheme(o)).toBe("dark");
  expect(await canvas(o)).not.toBe(world.before as string);
  expect(await canvas(o)).toBe(await tokenColorBackground(o));
});

/** The canvas color tokens.css gives a dark page, read from a page that is dark by attribute. */
async function tokenColorBackground(o: Opened) {
  const dark = await open(`<p>dark</p>`, { theme: "dark", context: o.context });
  const color = await canvas(dark);
  await dark.page.close();
  return color;
}

Then("the next page I open and my next visit are dark too", async (world) => {
  const first = world.o as Opened;
  // The next page, while the first is still open: same browser context, so the same storage.
  const next = await open(TOGGLE, { context: first.context });
  expect(await dataTheme(next)).toBe("dark");
  expect(await toggleName(next)).toBe("Theme: Dark");
  expect(await canvas(next)).toBe(await canvas(first));
  // The next visit: every page closed, then a page opened again.
  await first.page.close();
  await next.page.close();
  const visit = await open(TOGGLE, { context: first.context });
  expect(await dataTheme(visit)).toBe("dark");
  expect(await toggleName(visit)).toBe("Theme: Dark");
  expect(await canvas(visit)).toBe(await canvas(next === visit ? first : visit));
  await visit.context.close();
});

Then("the toggle offers light, dark and system", async (world) => {
  const o = await open(TOGGLE);
  world.o = o;
  const seen: [string, string | null, string | null][] = [];
  for (let i = 0; i < 4; i++) {
    seen.push([
      await toggleName(o),
      await o.page.$eval(
        "kan-theme-toggle",
        (e) => (e.shadowRoot!.querySelector("kan-icon") as unknown as { name: string }).name,
      ),
      await dataTheme(o),
    ]);
    await toggleButton(o).click();
    await settle(o);
  }
  // From the system setting it goes light, dark, system, and round again.
  expect(seen).toEqual([
    ["Theme: System", "monitor", null],
    ["Theme: Light", "sun", "light"],
    ["Theme: Dark", "moon", "dark"],
    ["Theme: System", "monitor", null],
  ]);
});

Then("choosing system clears my saved choice", async (world) => {
  const o = world.o as Opened;
  await chooseTheme(o, "Dark");
  expect(await savedTheme(o)).toBe("dark");
  await chooseTheme(o, "Light");
  expect(await savedTheme(o)).toBe("light");
  await chooseTheme(o, "System");
  expect(await savedTheme(o)).toBeNull();
  expect(await dataTheme(o)).toBeNull();
  // A reload then follows the system, and the toggle says so.
  await o.page.reload();
  await o.page.waitForFunction(() => document.querySelector("kan-theme-toggle")!.classList.contains("hydrated"));
  expect(await toggleName(o)).toBe("Theme: System");
  expect(await dataTheme(o)).toBeNull();
});

Then("the toggle is reachable and operable by keyboard alone", async (world) => {
  const o = await open(`<a href="#x">before</a>${TOGGLE}`);
  world.o = o;
  await o.page.keyboard.press("Tab");
  await o.page.keyboard.press("Tab");
  expect(await o.page.evaluate(() => document.activeElement?.localName)).toBe("kan-theme-toggle");
  expect(await o.page.evaluate(() => document.activeElement!.shadowRoot!.activeElement!.localName)).toBe("button");
  await o.page.keyboard.press("Enter");
  await settle(o);
  expect(await toggleName(o)).toBe("Theme: Light");
  await o.page.keyboard.press("Space");
  await settle(o);
  expect(await toggleName(o)).toBe("Theme: Dark");
});

Then("its accessible name says the current theme", async (world) => {
  const o = world.o as Opened;
  // The name a screen reader gets, from the accessibility tree.
  expect(await o.page.getByRole("button", { name: "Theme: Dark", exact: true }).count()).toBe(1);
  await toggleButton(o).click();
  await settle(o);
  expect(await o.page.getByRole("button", { name: "Theme: System", exact: true }).count()).toBe(1);
  expect(await o.page.getByRole("button", { name: "Theme: Dark", exact: true }).count()).toBe(0);
});

Then("a screen reader announces the new theme when it changes", async () => {
  const o = await open(TOGGLE);
  const region = () =>
    o.page.$eval("kan-theme-toggle", (e) => {
      const live = e.shadowRoot!.querySelector("[aria-live]")!;
      return {
        live: live.getAttribute("aria-live"),
        text: live.textContent,
        insideButton: !!live.closest("button"),
      };
    });
  // A live region is there from the start, empty, so a change in it is announced.
  expect(await region()).toEqual({ live: "polite", text: "", insideButton: false });
  await toggleButton(o).click();
  await settle(o);
  expect(await region()).toEqual({ live: "polite", text: "Theme: Light", insideButton: false });
  await toggleButton(o).click();
  await settle(o);
  expect((await region()).text).toBe("Theme: Dark");
});

Then("it implements THEME-002, THEME-003 and THEME-006", async () => {
  const theme = loadScenarios(path.join(ROOT, "specs/portfolio/features/theme.feature"));
  for (const id of ["THEME-002", "THEME-003", "THEME-006"]) {
    const scenario = theme.find((s) => s.id === id)!;
    expect([id, !!scenario]).toEqual([id, true]);
    const world: World = {};
    for (const text of scenario.steps) {
      const match = steps.match(text);
      expect([id, text, match !== null]).toEqual([id, text, true]);
      await match!.definition.fn(world, ...match!.args);
    }
  }
});

Then("it emits kanThemeChange with the chosen theme", async () => {
  const o = await open(`<div id="outer">${TOGGLE}</div>`);
  await o.page.evaluate(() => {
    const w = window as unknown as { seen: unknown[] };
    w.seen = [];
    document.getElementById("outer")!.addEventListener("kanThemeChange", (e) => w.seen.push((e as CustomEvent).detail));
  });
  for (let i = 0; i < 4; i++) {
    await toggleButton(o).click();
    await settle(o);
  }
  // Heard outside the shadow root, once per choice, in cycle order.
  expect(await o.page.evaluate(() => (window as unknown as { seen: unknown[] }).seen)).toEqual([
    { theme: "light" },
    { theme: "dark" },
    { theme: "system" },
    { theme: "light" },
  ]);
});

// ── KIT-010 kan-site-header ─────────────────────────────

const HEADER = `<kan-site-header>
  <a slot="brand" href="#home">Ian Kaneshiro</a>
  <kan-link href="#work">Work</kan-link>
  <a href="#about">About</a>
  <kan-link href="#contact">Contact</kan-link>
</kan-site-header>
<main id="main"><h1>Page</h1></main>`;

Then("it shows Ian's name, the navigation links and the theme toggle", async (world) => {
  const o = await open(HEADER, { viewport: { width: 1280, height: 800 } });
  world.o = o;
  const { page } = o;
  expect(await page.getByRole("banner").count()).toBe(1);
  const nav = page.getByRole("navigation", { name: "Main" });
  expect(await nav.count()).toBe(1);
  expect(await page.getByRole("link", { name: "Ian Kaneshiro" }).isVisible()).toBe(true);
  for (const name of ["Work", "About", "Contact"]) {
    const link = page.getByRole("link", { name });
    expect([name, await link.count(), await link.isVisible()]).toEqual([name, 1, true]);
  }
  expect(await page.getByRole("button", { name: "Theme: System" }).isVisible()).toBe(true);
  // On a wide screen there is no menu button.
  expect(await page.locator("kan-site-header .menu-button").isVisible()).toBe(false);
});

Then("below the md breakpoint the links move into a menu button that opens and closes with the keyboard", async () => {
  const linksVisible = async (o: Opened) =>
    (
      await Promise.all(
        ["Work", "About", "Contact"].map((name) => o.page.getByRole("link", { name }).first().isVisible()),
      )
    ).every(Boolean);
  // The md token is 768px: at it the links are in the bar, a pixel under it they are behind the button.
  for (const [width, narrow] of [
    [768, false],
    [767, true],
  ] as const) {
    const o = await open(HEADER, { viewport: { width, height: 800 } });
    expect([width, await linksVisible(o), await o.page.locator(".menu-button").isVisible()]).toEqual([
      width,
      !narrow,
      narrow,
    ]);
    await o.context.close();
  }

  const o = await open(HEADER, { viewport: { width: 375, height: 800 } });
  const menu = o.page.getByRole("button", { name: "Menu" });
  const state = () =>
    o.page.$eval("kan-site-header", (e) => {
      const inner = e.shadowRoot!;
      const button = inner.querySelector(".menu-button")!;
      return {
        expanded: button.getAttribute("aria-expanded"),
        controlsNav: inner.getElementById(button.getAttribute("aria-controls")!)?.localName,
        active: inner.activeElement?.className ?? document.activeElement?.localName,
        icon: (button.querySelector("kan-icon") as unknown as { name: string }).name,
      };
    });
  // Closed: the links aren't shown, and Tab goes from the name to the menu button to the toggle, never to a link.
  expect(await menu.isVisible()).toBe(true);
  expect(await linksVisible(o)).toBe(false);
  expect(await state()).toMatchObject({ expanded: "false", controlsNav: "nav", icon: "menu" });
  const tabStops: string[] = [];
  for (let i = 0; i < 3; i++) {
    await o.page.keyboard.press("Tab");
    tabStops.push(
      await o.page.evaluate(() => {
        const a = document.activeElement!;
        return a.shadowRoot?.activeElement ? `${a.localName}>${a.shadowRoot.activeElement.localName}` : a.localName;
      }),
    );
  }
  expect(tabStops).toEqual(["a", "kan-site-header>button", "kan-site-header>kan-theme-toggle"]);

  // Enter opens it; the links are shown and Tab reaches the first.
  await o.page.keyboard.press("Shift+Tab");
  await o.page.keyboard.press("Enter");
  await settle(o);
  expect(await state()).toMatchObject({ expanded: "true", icon: "close" });
  expect(await linksVisible(o)).toBe(true);
  await o.page.keyboard.press("Tab");
  expect(await o.page.evaluate(() => document.activeElement?.textContent)).toBe("Work");
  // Escape closes it from inside the links and puts focus back on the button.
  await o.page.keyboard.press("Escape");
  await settle(o);
  expect(await state()).toMatchObject({ expanded: "false", icon: "menu", active: "menu-button" });
  expect(await linksVisible(o)).toBe(false);
  // Space opens and closes it too, and Escape on a closed menu does nothing.
  await o.page.keyboard.press("Space");
  await settle(o);
  expect((await state()).expanded).toBe("true");
  await o.page.keyboard.press("Space");
  await settle(o);
  expect((await state()).expanded).toBe("false");
  await o.page.keyboard.press("Escape");
  await settle(o);
  expect(await state()).toMatchObject({ expanded: "false", active: "menu-button" });
});

// ── KIT-011 kan-site-footer ─────────────────────────────

Then(
  `it shows Ian's contact links and links to the site's source, the Storybook and "How this site was built"`,
  async () => {
    const o = await open(
      `<kan-site-footer>
  <kan-link slot="contact" href="mailto:iandkaneshiro@gmail.com">Email</kan-link>
  <kan-link slot="contact" href="https://github.com/IanKaneshiro" target="_blank">GitHub</kan-link>
  <kan-link href="https://github.com/IanKaneshiro/IanKaneshiro.github.io" target="_blank">Source</kan-link>
  <kan-link href="/storybook/">Storybook</kan-link>
  <kan-link href="/how-this-site-was-built/">How this site was built</kan-link>
</kan-site-footer>`,
    );
    const footer = await o.page.$eval("kan-site-footer", (e) => {
      const r = e.shadowRoot!;
      const assigned = (sel: string) =>
        (r.querySelector(sel) as HTMLSlotElement).assignedElements().map((a) => a.textContent);
      return {
        element: r.querySelector("footer") !== null,
        contact: assigned("slot[name=contact]"),
        links: assigned("slot:not([name])"),
        ownText: [...r.querySelectorAll("*")].flatMap((n) =>
          [...n.childNodes].filter((c) => c.nodeType === Node.TEXT_NODE && c.textContent!.trim()),
        ).length,
      };
    });
    // Every word comes from the page: the footer adds none of its own.
    expect(footer).toEqual({
      element: true,
      contact: ["Email", "GitHub"],
      links: ["Source", "Storybook", "How this site was built"],
      ownText: 0,
    });
    expect(await o.page.getByRole("contentinfo").count()).toBe(1);
    for (const name of ["Email", "GitHub", "Source", "Storybook", "How this site was built"]) {
      const link = o.page.getByRole("link", { name }).first();
      expect([name, await link.isVisible()]).toEqual([name, true]);
    }
  },
);

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
