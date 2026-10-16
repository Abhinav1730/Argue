import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const key = process.env.OPENROUTER_API_KEY;
let exposed = false;
async function scan(path: string) {
  for (const file of await readdir(path, { withFileTypes: true }).catch(
    () => [],
  )) {
    const full = path + "/" + file.name;
    if (file.isDirectory()) await scan(full);
    else if (key && (await readFile(full)).includes(Buffer.from(key)))
      exposed = true;
  }
}
await scan(".next/static");
await scan(".next/dev/static");
let tracked = false;
try {
  execFileSync("git", ["ls-files", "--error-unmatch", ".env"], {
    stdio: "pipe",
  });
  tracked = true;
} catch {}
console.log(
  JSON.stringify({
    keyConfigured: !!key,
    envTracked: tracked,
    keyFoundInBrowserAssets: exposed,
  }),
);
if (tracked || exposed) process.exitCode = 1;
