import stylelint from "stylelint";

/**
 * kan/no-primitive-tokens (GATE-006, CMP-002, SITE-007): components and pages use
 * semantic tokens only. A var() of a primitive token (a raw palette or scale step,
 * like --kan-color-cyan-500 or --kan-space-4) fails.
 *
 * Primitive names follow the PRIM naming. Once packages/tokens builds, this list
 * should come from its output instead.
 */

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

export const ruleName = "kan/no-primitive-tokens";
export const PRIMITIVE =
  /--kan-(?:color-(?:cyan|neutral|green|amber|red)-\d+|color-(?:white|black)|space-[\d.]+|font-(?:family|size|weight|line-height)-[\w-]+|radius-[\w-]+|border-width-[\w-]+|duration-[\w-]+|easing-[\w-]+|breakpoint-[\w-]+)\b/g;

const messages = ruleMessages(ruleName, {
  rejected: (name) =>
    `Primitive token "${name}" used outside packages/tokens. Use a semantic token for the role instead`,
});

const rule = (primary) => (root, result) => {
  if (!validateOptions(result, ruleName, { actual: primary, possible: [true] })) return;
  root.walkDecls((decl) => {
    for (const m of decl.value.matchAll(PRIMITIVE)) {
      report({ ruleName, result, node: decl, message: messages.rejected(m[0]), word: m[0] });
    }
  });
};
rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = { url: "specs/portfolio/features/components.feature (CMP-002)" };

export default createPlugin(ruleName, rule);
