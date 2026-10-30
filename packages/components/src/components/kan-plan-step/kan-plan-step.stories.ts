import { apiStory } from "../../docs/api";

export default { title: "Components/kan-plan-step" };

export const States = {
  render: () => `<kan-plan>
  <kan-plan-step state="done">done</kan-plan-step>
  <kan-plan-step state="in-progress">in progress</kan-plan-step>
  <kan-plan-step state="pending">pending</kan-plan-step>
</kan-plan>`,
};
export const Api = apiStory("kan-plan-step");
