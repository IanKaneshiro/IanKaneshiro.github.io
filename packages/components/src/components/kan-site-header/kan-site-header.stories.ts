import { apiStory } from "../../docs/api";

export default { title: "Components/kan-site-header" };

const header = `<kan-site-header>
  <a slot="brand" href="#home">Ian Kaneshiro</a>
  <kan-link href="#work">Work</kan-link>
  <kan-link href="#about">About</kan-link>
  <kan-link href="#contact">Contact</kan-link>
</kan-site-header>`;

/** Wide: the links sit in the bar. Narrow the viewport below 768px to see the menu button. */
export const Default = { render: () => header };
export const WithAnchors = {
  render: () => `<kan-site-header>
  <a slot="brand" href="#home">Ian Kaneshiro</a>
  <a href="#work">Work</a>
  <a href="#about">About</a>
</kan-site-header>`,
};
export const Api = apiStory("kan-site-header");
