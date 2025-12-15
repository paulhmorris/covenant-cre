// @ts-check
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import { defineConfig } from "astro/config";
import { viteStaticCopy } from "vite-plugin-static-copy";

const iconsPath = "node_modules/@shoelace-style/shoelace/dist/assets/icons";

export default defineConfig({
  site: "https://covenantcre.com",
  trailingSlash: "never",
  devToolbar: { enabled: false },

  vite: {
    resolve: { alias: [{ find: /\/assets\/icons\/(.+)/, replacement: `${iconsPath}/$1` }] },
    plugins: [tailwindcss(), viteStaticCopy({ targets: [{ src: iconsPath, dest: "assets" }] })],
  },

  integrations: [sitemap(), icon()],
  adapter: cloudflare(),
});
