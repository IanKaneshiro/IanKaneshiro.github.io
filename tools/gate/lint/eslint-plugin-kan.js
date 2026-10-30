/**
 * kan/component-tag-prefix (GATE-006, CMP-001): every Stencil component's tag
 * starts with "kan-".
 */

const componentTagPrefix = {
  meta: {
    type: "problem",
    docs: { description: "Stencil component tags start with kan-" },
    messages: {
      prefix: 'Component tag "{{tag}}" must start with "kan-". Rename it to "kan-{{suggestion}}".',
    },
    schema: [],
  },
  create(context) {
    return {
      Decorator(node) {
        const call = node.expression;
        if (call?.type !== "CallExpression" || call.callee?.name !== "Component") return;
        const options = call.arguments[0];
        if (options?.type !== "ObjectExpression") return;
        const tag = options.properties.find((p) => p.type === "Property" && (p.key.name ?? p.key.value) === "tag");
        if (tag?.value.type !== "Literal" || typeof tag.value.value !== "string") return;
        const value = tag.value.value;
        if (!value.startsWith("kan-")) {
          context.report({
            node: tag.value,
            messageId: "prefix",
            data: { tag: value, suggestion: value.replace(/^[a-z0-9]+-/, "") },
          });
        }
      },
    };
  },
};

export default { meta: { name: "kan" }, rules: { "component-tag-prefix": componentTagPrefix } };
