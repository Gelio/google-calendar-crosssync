import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";

export default {
  input: "src/cross-sync.ts",
  output: {
    dir: "output",
    format: "cjs",
    // NOTE: necessary for exporting cjs without runtime errors (rollup assigns exports.X)
    banner: "const exports = {};",
  },
  plugins: [typescript(), nodeResolve()],
};
