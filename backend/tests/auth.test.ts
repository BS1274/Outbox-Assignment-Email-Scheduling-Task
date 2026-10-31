import '../src/config';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';
import { signSession, readSession } from '../src/lib/jwt';

const stamp = Date.now();

describe('email and password authentication', () => {
  const testEmail = `auth_test_${stamp}@example.com`;
  const rawPassword = 'Password123!';
  let userId = '';

  after(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('hashes passwords with bcrypt and does not store plain text', async () => {
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    assert.notEqual(passwordHash, rawPassword);
    assert.match(passwordHash, /^\$2[aby]\$\d+\$/);

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash,
        name: 'Auth Test User',
      },
    });
    userId = user.id;

    const fetched = await prisma.user.findUnique({ where: { email: testEmail } });
    assert.ok(fetched);
    assert.equal(fetched.passwordHash, passwordHash);

    const matches = await bcrypt.compare(rawPassword, fetched.passwordHash!);
    assert.equal(matches, true);

    const wrongMatches = await bcrypt.compare('WrongPassword', fetched.passwordHash!);
    assert.equal(wrongMatches, false);
  });

  it('signs and verifies session tokens for authenticated users', () => {
    const token = signSession(userId);
    const resolvedUserId = readSession(token);
    assert.equal(resolvedUserId, userId);
  });

  it('enforces email uniqueness at the database level', async () => {
    await assert.rejects(
      async () => {
        await prisma.user.create({
          data: {
            email: testEmail,
            name: 'Duplicate User',
          },
        });
      },
      (err: any) => err.code === 'P2002' // Unique constraint violation
    );
  });
});
