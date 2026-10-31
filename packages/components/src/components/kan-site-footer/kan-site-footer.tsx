import { Component, h, Host } from "@stencil/core";

/**
 * The site footer (KIT-011): Ian's contact links and links to the site's source, the Storybook
 * and "How this site was built". Every word comes from the slots (CMP-006).
 *
 * @slot contact - Contact links, like email, GitHub and LinkedIn.
 * @slot - Links about the site: its source, the Storybook and how it was built.
 * @part footer - The footer.
 * @part contact - Wraps the contact links.
 * @part links - The site links.
 */
@Component({ tag: "kan-site-footer", styleUrl: "kan-site-footer.css", shadow: true })
export class KanSiteFooter {
  render() {
    return (
      <Host>
        <footer part="footer">
          <div class="contact" part="contact">
            <slot name="contact" />
          </div>
          <nav part="links" aria-label="Site">
            <slot />
          </nav>
        </footer>
      </Host>
    );
  }
}
