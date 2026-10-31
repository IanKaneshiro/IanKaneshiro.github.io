import { Component, Event, type EventEmitter, h, Host, State } from "@stencil/core";
import { applyTheme, type Theme } from "../../theme";
import type { IconName } from "../kan-icon/icons";

/** The key the choice is saved under. Only light and dark are saved; system is the absence of a choice. */
const STORAGE_KEY = "kan-theme";

/** The order one press cycles through. */
const CYCLE: Theme[] = ["light", "dark", "system"];

const SHOWN: Record<Theme, { icon: IconName; label: string }> = {
  light: { icon: "sun", label: "Light" },
  dark: { icon: "moon", label: "Dark" },
  system: { icon: "monitor", label: "System" },
};

function saved(): Theme | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : undefined;
  } catch {
    return undefined; // storage can be blocked; the toggle still works for this page
  }
}

function save(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage can be blocked; the choice then lasts until the page closes
  }
}

/**
 * A button that cycles the theme light, dark, system and back (KIT-009, THEME-002, THEME-003,
 * THEME-006). It shows a sun, moon or monitor, names the current theme ("Theme: Dark") and
 * announces a change. Light and dark are remembered in localStorage; system clears that.
 *
 * @part button - The button.
 */
@Component({ tag: "kan-theme-toggle", styleUrl: "kan-theme-toggle.css", shadow: true })
export class KanThemeToggle {
  /** Fires when the visitor picks a theme. `detail.theme` is "light", "dark" or "system". */
  @Event({ eventName: "kanThemeChange", bubbles: true, composed: true }) kanThemeChange!: EventEmitter<{
    theme: Theme;
  }>;

  @State() theme: Theme = "system";

  @State() announcement = "";

  componentWillLoad() {
    const choice = saved();
    if (choice) {
      this.theme = choice;
      applyTheme(choice);
    }
  }

  private next = () => {
    const theme = CYCLE[(CYCLE.indexOf(this.theme) + 1) % CYCLE.length];
    this.theme = theme;
    save(theme);
    applyTheme(theme);
    this.announcement = `Theme: ${SHOWN[theme].label}`;
    this.kanThemeChange.emit({ theme });
  };

  render() {
    const { icon, label } = SHOWN[this.theme];
    return (
      <Host>
        <button part="button" type="button" aria-label={`Theme: ${label}`} onClick={this.next}>
          <kan-icon name={icon} />
        </button>
        <span class="visually-hidden" aria-live="polite" aria-atomic="true">
          {this.announcement}
        </span>
      </Host>
    );
  }
}
