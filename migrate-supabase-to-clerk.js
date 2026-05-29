/**
 * migrate-supabase-to-clerk.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrates all users from a Supabase project into Clerk.
 *
 * Usage:
 *   Normal run:  node migrate-supabase-to-clerk.js
 *   Dry run:     node migrate-supabase-to-clerk.js --dry-run
 *
 * Required env vars (in .env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CLERK_SECRET_KEY
 *
 * Output:
 *   migration_report.json — written after all users are processed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { createClerkClient } = require('@clerk/backend');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 10;
const DELAY_MS = 300;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLERK_SECRET_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLERK_SECRET_KEY) {
  console.error(
    '❌  Missing required env vars. Check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLERK_SECRET_KEY in .env'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Split a full_name string into { firstName, lastName } */
function splitFullName(fullName = '') {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/** Fetch ALL users from Supabase using paginated admin API */
async function fetchAllSupabaseUsers() {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw new Error(`Supabase listUsers failed (page ${page}): ${error.message}`);

    const batch = data?.users ?? [];
    users.push(...batch);
    console.log(`  Fetched page ${page} — ${batch.length} users (total so far: ${users.length})`);

    // Supabase returns fewer than perPage when we're on the last page
    if (batch.length < perPage) break;
    page++;
  }

  return users;
}

/** Check whether a Clerk user with this email already exists */
async function clerkUserExists(email) {
  const list = await clerk.users.getUserList({ emailAddress: [email] });
  return list.totalCount > 0;
}

/** Build the Clerk createUser payload from a Supabase user record */
function buildClerkPayload(supaUser) {
  const meta = supaUser.user_metadata ?? {};

  // Resolve name fields
  let firstName = meta.first_name || meta.given_name || '';
  let lastName  = meta.last_name  || meta.family_name || '';
  if (!firstName && !lastName && meta.full_name) {
    ({ firstName, lastName } = splitFullName(meta.full_name));
  }

  const payload = {
    externalId: supaUser.id,                       // preserve Supabase UUID
    emailAddress: [supaUser.email].filter(Boolean),
    firstName:    firstName || undefined,
    lastName:     lastName  || undefined,
    publicMetadata: {
      supabase_id: supaUser.id,
      avatar_url:  meta.avatar_url || null,
      migrated_at: new Date().toISOString(),
    },
  };

  // Phone
  if (supaUser.phone) {
    payload.phoneNumber = [supaUser.phone];
  }

  // Password — try bcrypt hash first, fall back to skipPasswordRequirement
  const hash = supaUser.encrypted_password;
  if (hash && hash.startsWith('$2')) {
    payload.passwordDigest  = hash;
    payload.passwordHasher  = 'bcrypt';
  } else {
    payload.skipPasswordRequirement = true;
  }

  return payload;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('\n🔍  DRY RUN — no Clerk API calls will be made.\n');

  console.log('📥  Fetching users from Supabase…');
  const supabaseUsers = await fetchAllSupabaseUsers();
  console.log(`\n✅  Total Supabase users found: ${supabaseUsers.length}\n`);

  const failed = [];
  let successCount = 0;
  let skippedCount = 0;

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < supabaseUsers.length; i += BATCH_SIZE) {
    const batch = supabaseUsers.slice(i, i + BATCH_SIZE);

    for (const supaUser of batch) {
      const email = supaUser.email ?? '(no email)';

      try {
        // Idempotency check
        if (!DRY_RUN) {
          const exists = await clerkUserExists(email);
          if (exists) {
            console.log(`⏭  Skipped (already exists): ${email}`);
            skippedCount++;
            await sleep(DELAY_MS);
            continue;
          }
        }

        const payload = buildClerkPayload(supaUser);

        if (DRY_RUN) {
          console.log(`🔍  [DRY RUN] Would create: ${email}`, JSON.stringify(payload, null, 2));
          successCount++;
          continue;
        }

        await clerk.users.createUser(payload);
        console.log(`✅  Created: ${email}`);
        successCount++;

      } catch (err) {
        const msg = err?.errors?.[0]?.message ?? err.message ?? String(err);
        console.error(`❌  Failed: ${email} — ${msg}`);
        failed.push({
          email,
          supabase_id: supaUser.id,
          error: msg,
        });
      }

      await sleep(DELAY_MS);
    }

    if (i + BATCH_SIZE < supabaseUsers.length) {
      console.log(`\n  ↳ Batch complete (${Math.min(i + BATCH_SIZE, supabaseUsers.length)} / ${supabaseUsers.length})\n`);
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────

  const report = {
    dry_run:       DRY_RUN,
    total_users:   supabaseUsers.length,
    success_count: successCount,
    skipped_count: skippedCount,
    failed_count:  failed.length,
    failed_users:  failed,
    completed_at:  new Date().toISOString(),
  };

  const reportPath = 'migration_report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n──────────────────────────────────────────');
  console.log(`  Migration ${DRY_RUN ? '(dry run) ' : ''}complete`);
  console.log(`  Total:    ${report.total_users}`);
  console.log(`  Created:  ${report.success_count}`);
  console.log(`  Skipped:  ${report.skipped_count}`);
  console.log(`  Failed:   ${report.failed_count}`);
  console.log(`  Report:   ${reportPath}`);
  console.log('──────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
