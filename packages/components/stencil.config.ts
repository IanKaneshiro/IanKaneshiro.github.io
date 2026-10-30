import type { Config } from "@stencil/core";

/**
 * The kan- components. One build makes:
 *   www/build/kan.esm.js  the lazy loader: one script tag, and each page loads only the components
 *                         it uses (CMP-004, CMP-005)
 *   dist/                 the package, for the site and other consumers
 *   dist/components/      each component as a plain custom element, for Storybook
 *   docs.json             every prop, event, slot, part and custom property, for the docs (CMP-007)
 */
export const config: Config = {
  namespace: "kan",
  srcDir: "src",
  tsconfig: "tsconfig.json",
  outputTargets: [
    { type: "www", serviceWorker: null, buildDir: "build", copy: [] },
    { type: "dist", esmLoaderPath: "../loader" },
    // Storybook bundles with Vite, which can't follow the lazy loader's runtime imports.
    { type: "dist-custom-elements", customElementsExportBehavior: "bundle" },
    { type: "docs-json", file: "docs.json" },
  ],
};
