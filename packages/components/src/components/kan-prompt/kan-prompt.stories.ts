import { apiStory } from "../../docs/api";

export default { title: "Components/kan-prompt" };

export const Default = { render: () => `<kan-prompt>who is Ian Kaneshiro?</kan-prompt>` };
export const WithoutCursor = { render: () => `<kan-prompt cursor="false">who is Ian Kaneshiro?</kan-prompt>` };
export const CustomGlyph = { render: () => `<kan-prompt glyph="$">bun run gate</kan-prompt>` };
export const Api = apiStory("kan-prompt");
