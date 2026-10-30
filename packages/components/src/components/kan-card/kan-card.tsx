import { Component, h, Host, Prop } from "@stencil/core";

/**
 * A container on bg.surface with optional header and footer (KIT-004). With an href, the whole
 * card is clickable through one link around the header, stretched over the card, so links in the
 * footer stay separate and links are never nested.
 *
 * @slot header - The heading; with an href, this is the link's text.
 * @slot - The body.
 * @slot footer - Actions or metadata at the bottom.
 * @part card - The card.
 * @part header - The header.
 * @part body - The body.
 * @part footer - The footer.
 * @part link - The stretched link, when there's an href.
 */
@Component({ tag: "kan-card", styleUrl: "kan-card.css", shadow: true })
export class KanCard {
  /** Makes the whole card a link to this address. */
  @Prop() href?: string;

  render() {
    const header = <slot name="header" />;
    return (
      <Host>
        <article class={{ card: true, linked: !!this.href }} part="card">
          <div class="header" part="header">
            {this.href ? (
              <a part="link" href={this.href}>
                {header}
              </a>
            ) : (
              header
            )}
          </div>
          <div class="body" part="body">
            <slot />
          </div>
          <div class="footer" part="footer">
            <slot name="footer" />
          </div>
        </article>
      </Host>
    );
  }
}
