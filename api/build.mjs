import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.resolve(rootDir, "api");

await esbuild({
  entryPoints: [path.resolve(apiDir, "_handler.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outfile: path.resolve(apiDir, "index.mjs"),
  logLevel: "info",
  external: [
    "*.node",
    "bcrypt",
    "pg-native",
  ],
  sourcemap: "linked",
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
  },
});
