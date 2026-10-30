import { apiStory } from "../../docs/api";

export default { title: "Components/kan-project-card" };

const card = (links: string) => `<kan-project-card name="KanDiscer">
  A web app that helps disc golfers improve their game.
  <kan-tag slot="stack">React</kan-tag>
  <kan-tag slot="stack">Python</kan-tag>
  <kan-tag slot="stack">Flask</kan-tag>
  ${links}
</kan-project-card>`;

export const Default = {
  render: () =>
    card(`<kan-link slot="links" href="https://github.com/IanKaneshiro/KanDiscer" target="_blank">Source</kan-link>
  <kan-link slot="links" href="https://example.com" target="_blank">Live demo</kan-link>`),
};
export const SourceOnly = {
  render: () =>
    card(`<kan-link slot="links" href="https://github.com/IanKaneshiro/KanDiscer" target="_blank">Source</kan-link>`),
};
export const Api = apiStory("kan-project-card");
