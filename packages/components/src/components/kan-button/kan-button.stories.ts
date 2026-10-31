import { apiStory } from "../../docs/api";

export default { title: "Components/kan-button" };

export const Primary = { render: () => `<kan-button variant="primary">Get in touch</kan-button>` };
export const Secondary = { render: () => `<kan-button variant="secondary">View the source</kan-button>` };
export const Ghost = { render: () => `<kan-button variant="ghost">Read more</kan-button>` };
export const Small = { render: () => `<kan-button size="sm">Small</kan-button>` };
export const Medium = { render: () => `<kan-button size="md">Medium</kan-button>` };
export const Link = {
  render: () => `<kan-button href="#projects" variant="secondary">See the projects</kan-button>`,
};
export const Disabled = { render: () => `<kan-button disabled>Not yet</kan-button>` };
export const DisabledLink = {
  render: () => `<kan-button href="#projects" variant="secondary" disabled>Not yet</kan-button>`,
};
export const Submit = {
  render: () =>
    `<form onsubmit="event.preventDefault()"><kan-button type="submit">Send</kan-button> <kan-button type="button" variant="ghost">Cancel</kan-button></form>`,
};
export const Api = apiStory("kan-button");
