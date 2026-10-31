import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractEmails } from '../src/scheduling/extractEmails';

describe('extractEmails', () => {
  it('reads a csv, ignores junk, and collapses duplicates', () => {
    const emails = extractEmails(`email,name
Ada@Example.com,Ada
grace@example.com,Grace
not-an-email,skip
ada@example.com,Ada again
"linus@example.com"`);
    assert.deepEqual(emails, ['ada@example.com', 'grace@example.com', 'linus@example.com']);
  });

  it('reads one address per line', () => {
    assert.deepEqual(extractEmails('a@b.co\nb@b.co\n'), ['a@b.co', 'b@b.co']);
  });
});
