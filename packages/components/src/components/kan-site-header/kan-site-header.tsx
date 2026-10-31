import { Component, h, Host, State } from "@stencil/core";

/**
 * The site header (KIT-010): Ian's name, the main navigation and the theme toggle. Below the md
 * breakpoint (768px) the links sit behind a menu button that opens and closes with the keyboard;
 * Escape closes the menu and puts focus back on the button.
 *
 * @slot brand - Ian's name, as a link home.
 * @slot - The navigation links, as anchors or kan-link elements.
 * @part header - The header.
 * @part brand - Wraps the brand.
 * @part menu-button - The button that opens the links on a narrow screen.
 * @part nav - The navigation.
 */
@Component({ tag: "kan-site-header", styleUrl: "kan-site-header.css", shadow: true })
export class KanSiteHeader {
  @State() menuOpen = false;

  private menuButton?: HTMLButtonElement;

  private toggleMenu = () => {
    this.menuOpen = !this.menuOpen;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.menuOpen) {
      this.menuOpen = false;
      this.menuButton?.focus();
    }
  };

  render() {
    return (
      <Host>
        <header class={{ open: this.menuOpen }} part="header" onKeyDown={this.onKeyDown}>
          <div class="brand" part="brand">
            <slot name="brand" />
          </div>
          <button
            class="menu-button"
            part="menu-button"
            type="button"
            aria-label="Menu"
            aria-expanded={this.menuOpen ? "true" : "false"}
            aria-controls="nav"
            ref={(el) => (this.menuButton = el)}
            onClick={this.toggleMenu}
          >
            <kan-icon name={this.menuOpen ? "close" : "menu"} />
          </button>
          <nav id="nav" part="nav" aria-label="Main">
            <slot />
          </nav>
          <kan-theme-toggle class="toggle" />
        </header>
      </Host>
    );
  }
}
