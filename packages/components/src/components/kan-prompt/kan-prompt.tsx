import { Component, h, Host, Prop } from "@stencil/core";

/**
 * A prompt line, like the start of an agent session (KIT-007). The text is ordinary page content,
 * so it's in the HTML before JavaScript runs and screen readers read it once. The cursor is
 * decoration, and it stops blinking when the visitor prefers reduced motion.
 *
 * @slot - The prompt's text.
 * @part glyph - The prompt glyph.
 * @part text - The text.
 * @part cursor - The cursor.
 */
@Component({ tag: "kan-prompt", styleUrl: "kan-prompt.css", shadow: true })
export class KanPrompt {
  /** The glyph before the text. */
  @Prop() glyph = ">";

  /** Shows a blinking cursor after the text. Set cursor="false" to hide it. */
  @Prop() cursor = true;

  render() {
    return (
      <Host>
        <span class="line">
          <span class="glyph" part="glyph" aria-hidden="true">
            {this.glyph}
          </span>
          <span class="text" part="text">
            <slot />
          </span>
          {this.cursor && <span class="cursor" part="cursor" aria-hidden="true" />}
        </span>
      </Host>
    );
  }
}
