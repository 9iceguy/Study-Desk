import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mathJaxSource = resolve(projectRoot, "node_modules", "mathjax", "es5");
const mathJaxDestination = resolve(projectRoot, "public", "mathjax");

if (!existsSync(mathJaxSource)) {
  throw new Error(
    "MathJax assets are missing. Install the frontend dependencies before starting or building.",
  );
}

mkdirSync(mathJaxDestination, { recursive: true });
cpSync(mathJaxSource, mathJaxDestination, { recursive: true });
