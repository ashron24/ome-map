import { defineConfig } from "vite";

// For GitHub Pages project sites (https://<user>.github.io/<repo>/), set
// VITE_BASE_PATH=/<repo>/ in CI. For user/org sites (https://<user>.github.io/)
// or a custom domain at the root, leave it unset.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
});
