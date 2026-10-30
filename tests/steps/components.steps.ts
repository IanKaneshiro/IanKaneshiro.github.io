import { expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import stylelint from "stylelint";
import { stylelintFailures } from "../../tools/gate/checks";
import { componentDoc, renderApi, type ComponentDoc, type DocsJson } from "../../packages/components/src/docs/api";
import { open, scriptText, settle, type Opened } from "../support/browser";
import { Given, Then, When } from "../support/steps";

const ROOT = path.resolve(import.meta.dir, "../..");
const COMPONENTS = path.join(ROOT, "packages/components");
const SRC = path.join(COMPONENTS, "src/components");

/** docs.json from the build the browser harness runs (open() builds once per test run). */
async function docs(): Promise<DocsJson> {
  await open("");
  return JSON.parse(fs.readFileSync(path.join(COMPONENTS, "docs.json"), "utf8"));
}
const tags = async () => (await docs()).components.map((c) => c.tag);

/** Every story of every component, as HTML, leaving out the API pages. */
async function stories(): Promise<{ tag: string; name: string; html: string }[]> {
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

const ring = (o: Opened) =>
  o.page.$eval("kan-tool-call", (el) => {
    const b = el.shadowRoot!.querySelector("button")!;
    const s = getComputedStyle(b);
    const probe = document.createElement("div");
    probe.style.color = "var(--kan-focus-ring-color)";
    document.body.append(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return { style: s.outlineStyle, color: s.outlineColor, width: s.outlineWidth, want };
  });

Then("every interactive component is reachable by Tab", async (world) => {
  const o = await open(
    `<a href="#">before</a><kan-tool-call name="Read" arg="x"><span slot="result">r</span><p>details</p></kan-tool-call>`,
  );
  await o.page.keyboard.press("Tab");
  await o.page.keyboard.press("Tab");
  const focused = await o.page.evaluate(
    () => document.activeElement?.shadowRoot?.activeElement?.tagName ?? document.activeElement?.tagName,
  );
  expect(focused).toBe("BUTTON");
  world.o = o;
});

Then("shows the focus.ring on :focus-visible only", async (world) => {
  const o = world.o as Opened;
  const keyboard = await ring(o);
  expect(keyboard.style).toBe("solid");
  expect(keyboard.color).toBe(keyboard.want);
  expect(keyboard.width).toBe("2px");
  await o.page.mouse.click(5, 5);
  await o.page.locator("kan-tool-call button").click();
  expect((await ring(o)).style).toBe("none");
});

Then("responds to Enter and Space the way its native equivalent does", async (world) => {
  const o = world.o as Opened;
  const call = o.page.locator("kan-tool-call");
  const isOpen = async () => (await call.getAttribute("open")) !== null;
  await o.page.locator("kan-tool-call button").focus();
  await settle(o);
  const before = await isOpen();
  await o.page.keyboard.press("Enter");
  await settle(o);
  expect(await isOpen()).toBe(!before);
  await o.page.keyboard.press("Space");
  await settle(o);
  expect(await isOpen()).toBe(before);
  expect(
    await o.page.$eval("kan-tool-call", (el) => el.shadowRoot!.querySelector("button")!.getAttribute("aria-expanded")),
  ).toBe(String(before));
});

// ── CMP-010 No accessibility violations ─────────────────

Then("every story of every component passes axe with no violations in light and in dark", async () => {
  const axe = fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  const all = await stories();
  expect(all.length).toBeGreaterThan(5);
  for (const theme of ["light", "dark"] as const) {
    for (const s of all) {
      const o = await open(`<main><h1>${s.tag}</h1>${s.html}</main>`, { theme });
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
    const html = all
      .filter((s) => s.tag === c.tag)
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
    expect(stories).toContain('import docs from "@kan/components/docs.json";');
    expect(stories).toContain(`renderApi(componentDoc(docs, "${tag}"))`);
  }
  const doc = componentDoc(await docs(), "kan-prompt");
  const changed = {
    ...doc,
    props: [...doc.props, { name: "made-up", type: "string", docs: "A prop that only exists in this test." }],
  };
  expect(renderApi(changed)).toContain("A prop that only exists in this test.");
});
