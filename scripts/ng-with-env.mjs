#!/usr/bin/env node
// Forwards to the Angular CLI, injecting SUPABASE_URL / SUPABASE_ANON_KEY as
// esbuild `define` globals so they land as literals in the client bundle.
// Usage: node scripts/ng-with-env.mjs <build|serve> [...ng args]
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

try {
  process.loadEnvFile();
} catch {
  // No .env file present — rely on env vars already set in the shell (e.g. Vercel).
}

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your Supabase project values.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const ngCli = require.resolve('@angular/cli/bin/ng.js');

const defineArgs = REQUIRED_ENV.map(
  (key) => `--define=${key}=${JSON.stringify(process.env[key])}`,
);

execFileSync(process.execPath, [ngCli, ...process.argv.slice(2), ...defineArgs], {
  stdio: 'inherit',
});
