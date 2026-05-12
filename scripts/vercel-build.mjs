import { execSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, ".vercel", "output");

console.log("=== Building API function ===");
execSync("node api/build.mjs", { stdio: "inherit", cwd: root });

console.log("=== Building frontend ===");
execSync("pnpm --filter @workspace/edu-pass run build", { stdio: "inherit", cwd: root });

console.log("=== Assembling Build Output API ===");

mkdirSync(path.join(outputDir, "static"), { recursive: true });
mkdirSync(path.join(outputDir, "functions", "api.func"), { recursive: true });

cpSync(
  path.join(root, "artifacts", "edu-pass", "dist", "public"),
  path.join(outputDir, "static"),
  { recursive: true }
);

cpSync(
  path.join(root, "api", "index.mjs"),
  path.join(outputDir, "functions", "api.func", "index.mjs")
);

writeFileSync(
  path.join(outputDir, "functions", "api.func", ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs20.x",
    handler: "index.mjs",
    launcherType: "Nodejs",
    maxDuration: 10,
  }, null, 2)
);

writeFileSync(
  path.join(outputDir, "config.json"),
  JSON.stringify({
    version: 3,
    routes: [
      { src: "/api/(.*)", dest: "/api" },
      { handle: "filesystem" },
      { src: "/(.*)", dest: "/index.html" },
    ],
  }, null, 2)
);

console.log("=== Build Output API assembled ===");
