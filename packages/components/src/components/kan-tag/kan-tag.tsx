import { Component, h, Host, Prop } from "@stencil/core";
import type { IconName } from "../kan-icon/icons";

/**
 * A short mono label, like a technology name (KIT-003). It isn't interactive.
 *
 * @slot - The label.
 * @part tag - The tag.
 * @part icon - The optional leading icon.
 */
@Component({ tag: "kan-tag", styleUrl: "kan-tag.css", shadow: true })
export class KanTag {
  /** An icon before the label. */
  @Prop() icon?: IconName;

  render() {
    return (
      <Host>
        <span class="tag" part="tag">
          {this.icon && <kan-icon part="icon" name={this.icon} />}
          <slot />
        </span>
      </Host>
    );
  }
}
