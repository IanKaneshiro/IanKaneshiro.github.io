import { Component, h, Host, Prop } from "@stencil/core";

/**
 * A terminal window (KIT-008): a framed window on bg.inset with a title bar. Commands and output
 * go in the default slot, in the mono family. Long lines scroll inside the window, which can be
 * focused and scrolled with the keyboard, instead of widening the page.
 *
 * @slot - Commands and output, e.g. kan-prompt elements and pre blocks.
 * @part window - The window.
 * @part titlebar - The title bar.
 * @part title - The title.
 * @part body - The scrolling body.
 */
@Component({ tag: "kan-terminal", styleUrl: "kan-terminal.css", shadow: true })
export class KanTerminal {
  /** The window's title, like "~/ian". */
  @Prop() heading = "terminal";

  render() {
    return (
      <Host>
        <figure class="window" part="window">
          <div class="titlebar" part="titlebar">
            <span class="dots" aria-hidden="true">
              ● ● ●
            </span>
            <span class="title" part="title">
              {this.heading}
            </span>
          </div>
          <div class="body" part="body" tabindex="0" role="region" aria-label={this.heading}>
            <slot />
          </div>
        </figure>
      </Host>
    );
  }
}
