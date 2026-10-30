import { apiStory } from "../../docs/api";
import { ICON_NAMES } from "./icons";

export default { title: "Components/kan-icon" };

export const Set = {
  render: () =>
    `<div style="display: flex; gap: 1rem; font-size: 1.5rem">${ICON_NAMES.map((n) => `<kan-icon name="${n}"></kan-icon>`).join("")}</div>`,
};
export const Labelled = { render: () => `<kan-icon name="github" label="GitHub"></kan-icon>` };
export const Api = apiStory("kan-icon");
