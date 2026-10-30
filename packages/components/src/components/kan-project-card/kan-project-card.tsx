import { Component, h, Host, Prop } from "@stencil/core";

/**
 * A project (KIT-005): its name, a one-line summary, its stack as tags, and links to the source
 * and, when there is one, a live demo. It's a kan-card; put kan-tag elements in the stack slot and
 * kan-link elements in the links slot.
 *
 * @slot - The one-line summary.
 * @slot stack - kan-tag elements, one per technology.
 * @slot links - kan-link elements: the source, and a live demo when there is one.
 * @part name - The project's name.
 * @part summary - The summary.
 * @part stack - The stack tags.
 * @part links - The links.
 */
@Component({ tag: "kan-project-card", styleUrl: "kan-project-card.css", shadow: true })
export class KanProjectCard {
  /** The project's name. */
  @Prop() name = "";

  render() {
    return (
      <Host>
        <kan-card>
          <h3 slot="header" class="name" part="name">
            {this.name}
          </h3>
          <p class="summary" part="summary">
            <slot />
          </p>
          <div slot="footer" class="footer">
            <div class="stack" part="stack">
              <slot name="stack" />
            </div>
            <div class="links" part="links">
              <slot name="links" />
            </div>
          </div>
        </kan-card>
      </Host>
    );
  }
}
