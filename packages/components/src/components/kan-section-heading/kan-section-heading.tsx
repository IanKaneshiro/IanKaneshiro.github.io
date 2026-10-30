import { Component, h, Host, Prop } from "@stencil/core";

const LEVELS = [2, 3, 4, 5, 6] as const;

/**
 * A section heading in the terminal style, like "── projects ──" (KIT-006). It's a real heading,
 * so it's in the page outline; the rule characters are hidden from screen readers.
 *
 * @slot - The heading's label.
 * @part heading - The heading element.
 * @part label - The label.
 * @part rule - The rules before and after the label.
 */
@Component({ tag: "kan-section-heading", styleUrl: "kan-section-heading.css", shadow: true })
export class KanSectionHeading {
  /** The heading level, from 2 to 6. Anything else renders an h2. */
  @Prop() level: 2 | 3 | 4 | 5 | 6 = 2;

  render() {
    const Tag = `h${LEVELS.includes(this.level) ? this.level : 2}` as "h2";
    return (
      <Host>
        <Tag class="heading" part="heading">
          <span class="rule" part="rule" aria-hidden="true">
            ──
          </span>
          <span class="label" part="label">
            <slot />
          </span>
          <span class="rule rule-end" part="rule" aria-hidden="true" />
        </Tag>
      </Host>
    );
  }
}
