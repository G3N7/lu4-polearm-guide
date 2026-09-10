import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HtmlValidate } from 'html-validate';
import { ROOT, readGuide, load } from '../scripts/guide.mjs';

export const html = readGuide();
export const $ = load(html);

/** A fresh temp directory under the OS temp dir. */
export function tmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `lu4-${name}-`));
}

// The same rules as `npm run lint`: html-validate's API does not read .htmlvalidate.json by itself.
const { $schema: _ignored, ...lintConfig } = JSON.parse(fs.readFileSync(path.join(ROOT, '.htmlvalidate.json'), 'utf8'));
export const validator = new HtmlValidate(lintConfig);

/** Assert a file is valid HTML under the repo's lint rules. */
export async function assertValidHtml(file, assert) {
  const report = await validator.validateFile(file);
  const messages = report.results.flatMap((r) => r.messages.map((m) => `${m.line}:${m.column} ${m.message} (${m.ruleId})`));
  assert.deepEqual(messages, [], `${path.basename(file)} is not valid HTML`);
}
