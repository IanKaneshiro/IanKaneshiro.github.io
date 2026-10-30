import { Component, h, Host } from "@stencil/core";

/**
 * An ordered checklist of steps, like an agent's plan (KIT-014). Put kan-plan-step elements in it.
 *
 * @slot - kan-plan-step elements, in order.
 * @part list - The list.
 */
@Component({ tag: "kan-plan", styleUrl: "kan-plan.css", shadow: true })
export class KanPlan {
  render() {
    return (
      <Host>
        <div class="list" part="list" role="list">
          <slot />
        </div>
      </Host>
    );
  }
}
