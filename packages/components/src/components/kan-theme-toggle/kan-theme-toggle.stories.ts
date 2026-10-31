import { apiStory } from "../../docs/api";

export default { title: "Components/kan-theme-toggle" };

export const Default = {
  render: () => `<p>Press it to cycle light, dark and system. It remembers light and dark.</p>
<kan-theme-toggle></kan-theme-toggle>`,
};
export const Api = apiStory("kan-theme-toggle");
