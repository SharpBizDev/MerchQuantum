import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      ".tmp/**",
      "dist/**",
      "target/**",
      "tests/**",
      "eslint.config.mjs",
      "postcss.config.mjs",
      "tsconfig.tsbuildinfo",
      "lib/ai/listing-engine.ts",
      "lib/ai/context-quantum-evaluator.ts.*.bak",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["app/components/MerchQuantumApp.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
