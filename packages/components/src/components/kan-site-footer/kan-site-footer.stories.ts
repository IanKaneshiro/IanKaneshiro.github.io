import { apiStory } from "../../docs/api";

export default { title: "Components/kan-site-footer" };

export const Default = {
  render: () => `<kan-site-footer>
  <kan-link slot="contact" href="mailto:iandkaneshiro@gmail.com">Email</kan-link>
  <kan-link slot="contact" href="https://github.com/IanKaneshiro" target="_blank">GitHub</kan-link>
  <kan-link slot="contact" href="https://www.linkedin.com/in/iankaneshiro" target="_blank">LinkedIn</kan-link>
  <kan-link href="https://github.com/IanKaneshiro/IanKaneshiro.github.io" target="_blank">Source</kan-link>
  <kan-link href="#storybook">Storybook</kan-link>
  <kan-link href="#how-this-site-was-built">How this site was built</kan-link>
</kan-site-footer>`,
};
export const Api = apiStory("kan-site-footer");
