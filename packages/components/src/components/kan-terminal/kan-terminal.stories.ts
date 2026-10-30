import { apiStory } from "../../docs/api";

export default { title: "Components/kan-terminal" };

export const Default = {
  render: () => `<kan-terminal heading="~/ian">
  <kan-prompt cursor="false">whoami</kan-prompt>
  <pre>Ian Kaneshiro, software engineer</pre>
</kan-terminal>`,
};
export const LongLines = {
  render: () => `<kan-terminal heading="~/ian/logs">
  <pre>${"bun run gate · format lint typecheck test specs behaviors hygiene secrets pr-trace dependencies protected-paths protection ".repeat(2)}</pre>
</kan-terminal>`,
};
export const Api = apiStory("kan-terminal");
