import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      "tests/**",
      "eslint.config.mjs",
      "postcss.config.mjs",
      "lib/ai/listing-engine.ts",
    ],
  },
  {
    files: [
      "app/components/merch-quantum/controller.tsx",
      "app/components/merch-quantum/ui.tsx",
      "app/components/merch-quantum/hooks/*.ts",
      "app/components/merch-quantum/hooks/*.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["app/components/merch-quantum/ui.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
