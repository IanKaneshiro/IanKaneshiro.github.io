import { apiStory } from "../../docs/api";

export default { title: "Components/kan-link" };

export const Default = {
  render: () => `<p>Read the <kan-link href="#specs">spec graph</kan-link> behind this site.</p>`,
};
export const NewTab = {
  render: () => `<p>Ian on <kan-link href="https://github.com/IanKaneshiro" target="_blank">GitHub</kan-link>.</p>`,
};
export const Api = apiStory("kan-link");
