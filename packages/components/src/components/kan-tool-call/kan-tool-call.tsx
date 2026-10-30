import { Component, Element, Event, type EventEmitter, h, Host, Prop, State } from "@stencil/core";

export type ToolCallStatus = "pending" | "success" | "error";

/** Each status has its own glyph and words, so it never depends on color alone. */
const STATUS: Record<ToolCallStatus, { glyph: string; label: string }> = {
  pending: { glyph: "○", label: "running" },
  success: { glyph: "●", label: "done" },
  error: { glyph: "✗", label: "failed" },
};

/**
 * A tool call the way an agent session shows it (KIT-013):
 *
 *     ● Read(profile)
 *       ⎿ Software Engineer
 *
 * Put details in the default slot and the call line becomes a button that shows and hides them.
 *
 * @slot - Details, shown when the call is open. Leave it empty for a call without details.
 * @slot result - The one-line result.
 * @part call - The call line; a button when there are details.
 * @part glyph - The status glyph.
 * @part result - The result line.
 * @part details - The details.
 */
@Component({ tag: "kan-tool-call", styleUrl: "kan-tool-call.css", shadow: true })
export class KanToolCall {
  @Element() el!: HTMLElement;

  /** The tool's name, like "Read". */
  @Prop() name = "";

  /** A short argument, like "profile". */
  @Prop() arg?: string;

  /** Whether the call is still running, succeeded or failed. */
  @Prop({ reflect: true }) status: ToolCallStatus = "success";

  /** Whether the details are shown. */
  @Prop({ mutable: true, reflect: true }) open = false;

  /** Fires when the details are shown or hidden. `detail.open` is the new state. */
  @Event({ eventName: "kanToggle", bubbles: true, composed: true }) kanToggle!: EventEmitter<{ open: boolean }>;

  @State() hasDetails = false;

  componentWillLoad() {
    this.updateDetails();
  }

  private updateDetails = () => {
    this.hasDetails = Array.from(this.el.childNodes).some((n) =>
      n.nodeType === Node.ELEMENT_NODE ? !(n as Element).hasAttribute("slot") : !!n.textContent?.trim(),
    );
  };

  private toggle = () => {
    this.open = !this.open;
    this.kanToggle.emit({ open: this.open });
  };

  render() {
    const status = STATUS[this.status] ?? STATUS.success;
    const call = [
      <span class="glyph" part="glyph" aria-hidden="true">
        {status.glyph}
      </span>,
      <span class="visually-hidden">{status.label}: </span>,
      <span class="name">{this.name}</span>,
      this.arg ? <span class="arg">({this.arg})</span> : null,
    ];
    return (
      <Host>
        {this.hasDetails ? (
          <button
            class="call"
            part="call"
            type="button"
            aria-expanded={this.open ? "true" : "false"}
            aria-controls="details"
            onClick={this.toggle}
          >
            {call}
            <span class="chevron" aria-hidden="true">
              {this.open ? "▾" : "▸"}
            </span>
          </button>
        ) : (
          <div class="call" part="call">
            {call}
          </div>
        )}
        <div class="result" part="result">
          <span class="elbow" aria-hidden="true">
            ⎿
          </span>
          <slot name="result" />
        </div>
        <div id="details" class="details" part="details" hidden={!this.open || !this.hasDetails}>
          <slot onSlotchange={this.updateDetails} />
        </div>
      </Host>
    );
  }
}
