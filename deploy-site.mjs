// Deploy ONLY the static marketing/legal host to forge's gh-pages branch.
// forge (imadtn/forge) is NO LONGER the app — it is a static host for the SHIPPED iOS app's
// runtime URLs (privacy.html, terms.html, onboarding/*.mp4) + the marketing landing. The app
// SOURCE lives in the private repo (imadtn/beatlast-app). This script must NEVER publish the
// runnable web app (that was the pre-2026-07-08 behaviour and let strangers sign up on the web).
//
// It assembles public/ (the static site) into a temp dir, makes landing.html the index, and
// publishes that dir — with NO vite build, so the SPA bundle can't leak onto gh-pages.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ghpages from "gh-pages";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, "public");
const out = path.join(root, ".site-dist");
const FORGE_REPO = "https://github.com/imadtn/forge.git";

await fs.rm(out, { recursive: true, force: true });
await fs.cp(src, out, { recursive: true });
// public/ has no index.html on purpose (it would clash with the app's SPA entry during a vite
// build). The marketing landing IS the site root here, so copy it into place.
await fs.copyFile(path.join(out, "landing.html"), path.join(out, "index.html"));

await new Promise((resolve, reject) =>
  ghpages.publish(
    out,
    { branch: "gh-pages", repo: FORGE_REPO, dotfiles: true, message: "Deploy static host (privacy/terms/onboarding/landing)" },
    (err) => (err ? reject(err) : resolve())
  )
);
await fs.rm(out, { recursive: true, force: true });
console.log("Published static host → imadtn/forge gh-pages");
