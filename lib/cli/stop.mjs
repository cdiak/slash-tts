import { pathToFileURL } from "url";
import * as path from "path";
import { controlMain } from "./speak.mjs";

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  controlMain("stop").catch((err) => {
    console.error("[kokoro-stop] Error:", err.message || err);
    process.exit(1);
  });
}