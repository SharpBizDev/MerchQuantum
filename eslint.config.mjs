import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      "tests/**",
      "eslint.config.mjs",
      "postcss.config.mjs",
      "lib/ai/listing-engine.ts",
      "public/refinery-wasm/**",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
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
