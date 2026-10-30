declare module "*.css";

declare module "@kan/tokens/tokens.json" {
  const rows: import("@kan/tokens/build").Row[];
  export default rows;
}
