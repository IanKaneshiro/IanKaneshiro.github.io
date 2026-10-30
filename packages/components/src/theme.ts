/**
 * The one way a theme is applied (DOCS-002, THEME-002, THEME-003). Storybook's toolbar uses it
 * now; the site's theme toggle will use the same function, so both set data-theme the same way.
 *
 * tokens.css reads it: [data-theme="dark"] turns dark on, and prefers-color-scheme: dark applies
 * unless data-theme="light" is set. "system" removes the attribute so the visitor's setting wins.
 */

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

type Root = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

export function applyTheme(theme: Theme, root: Root = document.documentElement): void {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/** Storybook's toolbar control for the theme. */
export const themeGlobalType = {
  theme: {
    description: "Color theme",
    toolbar: {
      title: "Theme",
      icon: "mirror",
      items: [
        { value: "system", title: "System" },
        { value: "light", title: "Light" },
        { value: "dark", title: "Dark" },
      ],
      dynamicTitle: true,
    },
  },
};

/** Applies the toolbar's theme before every story renders. */
export const themeDecorator = <T>(story: () => T, context: { globals: Record<string, unknown> }): T => {
  const theme = THEMES.includes(context.globals.theme as Theme) ? (context.globals.theme as Theme) : "system";
  applyTheme(theme);
  return story();
};
