/** Stylelint for every CSS file, plus the design-system rules for components and the site (GATE-006). */
export default {
  extends: ["stylelint-config-standard"],
  plugins: ["./tools/gate/lint/stylelint-plugin-kan.js"],
  ignoreFiles: ["node_modules/**", "**/dist/**", "**/www/**", "**/storybook-static/**"],
  overrides: [
    {
      files: ["packages/components/**/*.css", "apps/site/**/*.css"],
      rules: {
        "color-no-hex": true,
        "color-named": "never",
        "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color"],
        "kan/no-primitive-tokens": true,
      },
    },
  ],
};
