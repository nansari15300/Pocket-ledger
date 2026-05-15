import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Firestore mutation imports: `src/lib` (gateway ke bahar) + `src/hooks` + `src/api` par ESLint error.
  // `components` / `app` / `firebase` — `npm run check:gateway-writes` se CI gate; yahan ignore taaki `npm run lint` practical rahe.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/writeGateway/**",
      "src/lib/localVoucherOutbox.ts",
      "src/components/**",
      "src/app/**",
      "src/firebase/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "firebase/firestore",
              importNames: [
                "setDoc",
                "updateDoc",
                "addDoc",
                "deleteDoc",
                "runTransaction",
                "writeBatch",
              ],
              message:
                "Company data writes must use writeEntity / writeGateway; sync flush only in localVoucherOutbox.",
            },
            {
              name: "@/lib/writeGateway/firestoreMutationsInternal",
              message: "Only modules under src/lib/writeGateway may import firestoreMutationsInternal.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
