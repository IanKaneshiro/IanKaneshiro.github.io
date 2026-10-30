import { apiStory } from "../../docs/api";
import { ICON_NAMES } from "../kan-icon/icons";

export default { title: "Components/kan-tag" };

export const Default = { render: () => `<kan-tag>TypeScript</kan-tag>` };
export const Stack = {
  render: () => ["TypeScript", "StencilJS", "Storybook", "Claude Code"].map((t) => `<kan-tag>${t}</kan-tag>`).join(" "),
};
export const WithIcons = { render: () => ICON_NAMES.map((n) => `<kan-tag icon="${n}">${n}</kan-tag>`).join(" ") };
export const Api = apiStory("kan-tag");
