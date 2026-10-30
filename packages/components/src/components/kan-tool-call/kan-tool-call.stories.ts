import { apiStory } from "../../docs/api";

export default { title: "Components/kan-tool-call" };

const call = (attrs: string, details = "") =>
  `<kan-tool-call name="Read" arg="profile"${attrs}><span slot="result">Software Engineer</span>${details}</kan-tool-call>`;

export const Success = { render: () => call(` status="success"`) };
export const Pending = { render: () => call(` status="pending"`) };
export const Error = { render: () => call(` status="error"`) };
export const WithDetails = {
  render: () => call("", "<p>Software Engineer. Design systems, web components and agentic development.</p>"),
};
export const Open = {
  render: () => call(" open", "<p>Software Engineer. Design systems, web components and agentic development.</p>"),
};
export const Session = {
  render: () => `<kan-prompt>who is Ian Kaneshiro?</kan-prompt>
<kan-tool-call name="Read" arg="profile"><span slot="result">Software Engineer</span></kan-tool-call>
<kan-tool-call name="Read" arg="stack"><span slot="result">TypeScript · StencilJS · Storybook</span></kan-tool-call>
<kan-tool-call name="Read" arg="workflow"><span slot="result">spec-driven, with Claude Code, Cursor and Grok Build</span></kan-tool-call>`,
};
export const Api = apiStory("kan-tool-call");
