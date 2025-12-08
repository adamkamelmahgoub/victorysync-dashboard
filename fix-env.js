#!/usr/bin/env node

/**
 * Fix corrupted SUPABASE_URL in Vercel Production environment
 * This script uses the Vercel CLI authenticated session to update the env var
 */

const { execSync } = require('child_process');

const projectName = 'victorysync-dashboard-server';
const envVarName = 'SUPABASE_URL';
const correctValue = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const environment = 'production';

console.log(`\n🔧 Fixing ${envVarName} in Vercel...`);
console.log(`   Project: ${projectName}`);
console.log(`   Environment: ${environment}`);
console.log(`   Value: ${correctValue}\n`);

try {
  // Remove old corrupted value (if exists)
  try {
    console.log('⏳ Removing old value...');
    execSync(`npx vercel env rm ${envVarName} ${environment} --scope adam-mahgoubs-projects --cwd .`, {
      stdio: 'inherit'
    });
  } catch (e) {
    // Ignore if already removed
  }

  // Add new correct value
  console.log('⏳ Adding correct value...');
  execSync(`npx vercel env add ${envVarName} ${environment} --scope adam-mahgoubs-projects --cwd . "${correctValue}"`, {
    stdio: 'inherit',
    shell: 'powershell.exe'
  });

  console.log('\n✅ Successfully updated SUPABASE_URL in Vercel!\n');
  console.log('📋 Next steps:');
  console.log('   1. Push a commit or redeploy in Vercel dashboard');
  console.log('   2. Wait for deployment to complete (should see "Ready")');
  console.log('   3. Visit https://dashboard.victorysync.com and verify metrics load\n');

  process.exit(0);
} catch (error) {
  console.error('\n❌ Error updating environment variable:');
  console.error(error.message);
  process.exit(1);
}
