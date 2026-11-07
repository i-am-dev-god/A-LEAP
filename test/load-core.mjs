/* Shared helper: the tests import src/core.js directly as an ES module.
   Nothing is bundled, nothing is mocked — the same file the browser runs. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function core() {
  return import(new URL('../src/core.js', import.meta.url).href);
}

export function read(rel) {
  return readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
}
