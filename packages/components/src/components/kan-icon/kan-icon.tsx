import { Component, h, Host, Prop } from "@stencil/core";
import { ICONS, type IconName } from "./icons";

/**
 * An icon from the kan- set (KIT-012). Decorative by default and hidden from assistive tech;
 * give it a label and it's announced as an image instead.
 *
 * @part svg - The SVG.
 */
@Component({ tag: "kan-icon", styleUrl: "kan-icon.css", shadow: true })
export class KanIcon {
  /** Which icon to draw. */
  @Prop() name: IconName = "terminal";

  /** What the icon means, for screen readers. Leave it out when the icon is decoration. */
  @Prop() label?: string;

  render() {
    const d = ICONS[this.name] ?? ICONS.terminal;
    return (
      <Host role={this.label ? "img" : undefined} aria-label={this.label} aria-hidden={this.label ? undefined : "true"}>
        <svg
          part="svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d={d} />
        </svg>
      </Host>
    );
  }
}
