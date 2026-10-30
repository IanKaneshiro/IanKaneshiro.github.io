import "@kan/tokens/tokens.css";
import "./preview.css";
import { themeDecorator, themeGlobalType } from "../src/theme";

export default {
  globalTypes: themeGlobalType,
  initialGlobals: { theme: "system" },
  decorators: [themeDecorator],
  parameters: { backgrounds: { disable: true } },
};
