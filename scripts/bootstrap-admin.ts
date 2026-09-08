/**
 * First-run setup.
 *
 * Installs roles/permissions and creates the first administrator, then stops.
 * It creates NO products, stock, suppliers or other business data — the
 * business enters its own.
 *
 * Usage:
 *   npm run bootstrap:admin -- --email owner@shpsolutions.in --name "Owner"
 *
 * The password is read from the ADMIN_PASSWORD environment variable, or
 * generated and printed once if that is not set.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/server/db/client';
import { locations, users } from '../src/server/db/schema';
import { ensureAccessControlSeed, roleIdByKey } from '../src/server/db/bootstrap';
import { hashPassword } from '../src/server/auth/crypto';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(randomBytes(20), (b) => alphabet[b % alphabet.length]).join('');
}

async function main() {
  const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const name = arg('name') ?? process.env.ADMIN_NAME ?? 'Administrator';

  if (!email) {
    console.error('An email is required: npm run bootstrap:admin -- --email you@example.com --name "Your Name"');
    process.exit(1);
  }

  console.log('Installing roles and permissions...');
  await ensureAccessControlSeed(db);

  // A default location is required before any stock can be recorded. This is
  // structural, not business data — rename it to your actual godown.
  const existingLocation = await db.select({ id: locations.id }).from(locations).limit(1);
  if (existingLocation.length === 0) {
    await db.insert(locations).values({
      code: 'MAIN',
      name: 'Main store',
      isDefault: true,
      isActive: true,
    });
    console.log('Created a default location (MAIN — "Main store"). Rename it under Locations.');
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (existing[0]) {
    console.log(`User ${email} already exists. Nothing else to do.`);
    await pool.end();
    return;
  }

  const password = process.env.ADMIN_PASSWORD ?? generatePassword();
  const roleId = await roleIdByKey(db, 'ADMIN');

  await db.insert(users).values({
    email,
    name,
    passwordHash: await hashPassword(password),
    roleId,
    mustChangePassword: !process.env.ADMIN_PASSWORD,
  });

  console.log(`\nAdministrator created: ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`Temporary password: ${password}`);
    console.log('Shown once. Sign in and change it immediately.\n');
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error('Bootstrap failed:', error);
  await pool.end().catch(() => {});
  process.exit(1);
});
