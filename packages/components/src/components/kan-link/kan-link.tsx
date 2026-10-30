import { Component, h, Host, Prop } from "@stencil/core";

/**
 * A link (KIT-002): a native anchor in the accent color, underlined, and more so on hover and
 * focus. A link that opens a new tab says so, with an icon and a hint for screen readers, and
 * gets rel="noopener noreferrer".
 *
 * @slot - The link text.
 * @part link - The anchor.
 */
@Component({ tag: "kan-link", styleUrl: "kan-link.css", shadow: true })
export class KanLink {
  /** Where the link goes. */
  @Prop() href = "";

  /** Where to open it. "_blank" opens a new tab. */
  @Prop() target?: string;

  render() {
    const newTab = this.target === "_blank";
    return (
      <Host>
        <a part="link" href={this.href} target={this.target} rel={newTab ? "noopener noreferrer" : undefined}>
          <slot />
          {newTab && <kan-icon class="external" name="external" />}
          {newTab && <span class="visually-hidden"> (opens in a new tab)</span>}
        </a>
      </Host>
    );
  }
}
