declare module "*.css";

declare module "@kan/components/docs.json" {
  const docs: import("./docs/api").DocsJson;
  export default docs;
}
