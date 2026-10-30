import docs from "@kan/components/docs.json";
import { componentDoc, renderApi } from "../../docs/api";

export default { title: "Components/kan-section-heading" };

export const Default = { render: () => `<kan-section-heading>projects</kan-section-heading>` };
export const Levels = {
  render: () =>
    [2, 3, 4, 5, 6].map((l) => `<kan-section-heading level="${l}">level ${l}</kan-section-heading>`).join("\n"),
};
export const Api = { render: () => renderApi(componentDoc(docs, "kan-section-heading")) };
