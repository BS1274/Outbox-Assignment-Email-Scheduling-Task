import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const FORBIDDEN = [/node-cron/, /from ['"]agenda['"]/, /node-schedule/, /cron\.schedule\(/];

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

describe('no cron', () => {
  it('does not import a cron library', async () => {
    const files = await sourceFiles(path.resolve(__dirname, '../src'));
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        assert.equal(pattern.test(text), false, `${file} matched ${pattern}`);
      }
    }
  });
});
