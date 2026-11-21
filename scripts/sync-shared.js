import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const source = path.join(root, "shared");
const destinations = [
  path.join(root, "extension", "lib"),
  path.join(root, "web", "js", "lib")
];
const files = fs.readdirSync(source).filter((name) => name.endsWith(".js"));
destinations.forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
  files.forEach((name) => {
    fs.copyFileSync(path.join(source, name), path.join(dir, name));
  });
});
console.log(`Copied ${files.length} shared modules into the extension and web app.`);
