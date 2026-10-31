import { AttachInternals, Component, h, Host, Prop } from "@stencil/core";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";
export type ButtonType = "button" | "submit";

/**
 * A button (KIT-001): a native button, or a native link when it has an href. A disabled button
 * can't be activated and is announced as unavailable; a disabled link has no href, is marked
 * aria-disabled and can't be focused.
 *
 * @slot - The label.
 * @part button - The native button or link.
 */
@Component({ tag: "kan-button", styleUrl: "kan-button.css", shadow: true, formAssociated: true })
export class KanButton {
  @AttachInternals() internals!: ElementInternals;

  /** How prominent it is: a filled primary, an outlined secondary or a quiet ghost. */
  @Prop({ reflect: true }) variant: ButtonVariant = "primary";

  /** How big it is. */
  @Prop({ reflect: true }) size: ButtonSize = "md";

  /** Makes it a link to this address instead of a button. */
  @Prop() href?: string;

  /** Whether it can't be activated. */
  @Prop({ reflect: true }) disabled = false;

  /** What a button does in a form: "submit" submits the form it is in. Links ignore it. */
  @Prop() type: ButtonType = "button";

  private submit = () => {
    if (this.type === "submit" && !this.disabled) this.internals.form?.requestSubmit();
  };

  render() {
    const classes = { button: true, [this.variant]: true, [this.size]: true };
    if (this.href !== undefined && this.href !== "") {
      return (
        <Host>
          {this.disabled ? (
            <a class={classes} part="button" role="link" aria-disabled="true">
              <slot />
            </a>
          ) : (
            <a class={classes} part="button" href={this.href}>
              <slot />
            </a>
          )}
        </Host>
      );
    }
    return (
      <Host>
        <button class={classes} part="button" type="button" disabled={this.disabled} onClick={this.submit}>
          <slot />
        </button>
      </Host>
    );
  }
}
