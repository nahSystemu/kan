import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-json";


export default defineConfig({
  locales: ["en", "ru"],
  sourceLocale: "en",
  catalogs: [
    {
      path: "src/locales/{locale}/messages",
      include: ["src"],
      exclude: ["**/node_modules/**"],
    },
  ],
  format: formatter({ style: "lingui" }),
});
