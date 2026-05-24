// Reads worker/.env, substitutes the placeholders in wrangler.toml.template,
// and writes worker/wrangler.toml. Also writes a .dev.vars for `wrangler dev`
// if a GOOGLE_CLIENT_ID is set in .env.
//
// Run automatically before `pnpm dev` and `pnpm deploy` via npm scripts.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerDir = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(workerDir, '.env');
const templatePath = join(workerDir, 'wrangler.toml.template');
const outPath = join(workerDir, 'wrangler.toml');
const devVarsPath = join(workerDir, '.dev.vars');

if (!existsSync(envPath)) {
  console.error(
    `[render-wrangler] worker/.env not found. Copy worker/.env.example to worker/.env and fill it in.`,
  );
  process.exit(1);
}

const env = parseDotEnv(readFileSync(envPath, 'utf8'));
const required = ['KV_NAMESPACE_ID'];
for (const key of required) {
  if (!env[key]) {
    console.error(`[render-wrangler] missing ${key} in worker/.env`);
    process.exit(1);
  }
}

const template = readFileSync(templatePath, 'utf8');
const rendered = template.replace(/__KV_NAMESPACE_ID__/g, env.KV_NAMESPACE_ID);
writeFileSync(outPath, rendered);
console.log(`[render-wrangler] wrote ${outPath}`);

if (env.GOOGLE_CLIENT_ID) {
  writeFileSync(devVarsPath, `GOOGLE_CLIENT_ID=${env.GOOGLE_CLIENT_ID}\n`);
  console.log(`[render-wrangler] wrote ${devVarsPath} for local dev`);
}

function parseDotEnv(text) {
  const out = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
