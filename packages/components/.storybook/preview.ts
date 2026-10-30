import "@kan/tokens/tokens.css";
import "./preview.css";
import { defineCustomElements } from "@kan/components/components";
import { themeDecorator, themeGlobalType } from "../src/theme";

defineCustomElements();

export default {
  globalTypes: themeGlobalType,
  initialGlobals: { theme: "system" },
  decorators: [themeDecorator],
  parameters: { backgrounds: { disable: true } },
};
