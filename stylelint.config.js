/** Stylelint for every CSS file, plus the design-system rules for components and the site (GATE-006). */
export default {
  extends: ["stylelint-config-standard"],
  plugins: ["./tools/gate/lint/stylelint-plugin-kan.js"],
  // The old site's CSS is served as-is until the cutover (SHIP-008).
  ignoreFiles: ["node_modules/**", "css/**", "**/dist/**", "**/www/**", "**/storybook-static/**"],
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
