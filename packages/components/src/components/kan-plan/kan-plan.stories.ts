import { apiStory } from "../../docs/api";

export default { title: "Components/kan-plan" };

export const WorkingOnNow = {
  render: () => `<kan-plan>
  <kan-plan-step state="done">The spec graph for this site</kan-plan-step>
  <kan-plan-step state="in-progress">The kan- web component library</kan-plan-step>
  <kan-plan-step state="pending">Tools that let agents trace a spec graph</kan-plan-step>
</kan-plan>`,
};
export const Api = apiStory("kan-plan");
