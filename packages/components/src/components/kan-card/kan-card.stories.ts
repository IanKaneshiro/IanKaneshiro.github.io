import { apiStory } from "../../docs/api";

export default { title: "Components/kan-card" };

export const Default = {
  render: () => `<kan-card>
  <strong slot="header">A card</strong>
  <p>Any content, on bg.surface.</p>
  <span slot="footer">footer</span>
</kan-card>`,
};
export const Linked = {
  render: () => `<kan-card href="#projects">
  <strong slot="header">The whole card is a link</strong>
  <p>Click anywhere on it.</p>
  <kan-link slot="footer" href="#other">A separate link</kan-link>
</kan-card>`,
};
export const Api = apiStory("kan-card");
