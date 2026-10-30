import { Component, h, Host, Prop } from "@stencil/core";

export type StepState = "done" | "in-progress" | "pending";

/** Each state has its own glyph and words, so it never depends on color alone. */
const STATES: Record<StepState, { glyph: string; label: string }> = {
  done: { glyph: "[x]", label: "done" },
  "in-progress": { glyph: "[~]", label: "in progress" },
  pending: { glyph: "[ ]", label: "not started" },
};

/**
 * One step of a kan-plan (KIT-014). Its state shows as a glyph and is announced as text.
 *
 * @slot - What the step is.
 * @part glyph - The state glyph.
 * @part text - The step's text.
 */
@Component({ tag: "kan-plan-step", styleUrl: "kan-plan-step.css", shadow: true })
export class KanPlanStep {
  /** Whether the step is done, in progress or not started yet. */
  @Prop({ reflect: true }) state: StepState = "pending";

  render() {
    const s = STATES[this.state] ?? STATES.pending;
    return (
      <Host role="listitem">
        <span class="glyph" part="glyph" aria-hidden="true">
          {s.glyph}
        </span>
        <span class="visually-hidden">{s.label}: </span>
        <span class="text" part="text">
          <slot />
        </span>
      </Host>
    );
  }
}
