#!/usr/bin/env node

/**
 * Simple wrapper that uses vercel CLI's authenticated session
 * to update the environment variable via a workaround
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_NAME = 'victorysync-dashboard-server';
const CORRECT_SUPABASE_URL = 'https://edsyhtlaqwiicxlzorca.supabase.co';

console.log('\n🔧 Fixing SUPABASE_URL in Vercel\n');

try {
  // First, check if we're authenticated
  console.log('✅ Verifying Vercel CLI authentication...');
  const whoami = execSync('npx vercel whoami', { encoding: 'utf8', stdio: 'pipe' }).trim();
  console.log(`   Logged in as: ${whoami}\n`);

  // Create a temporary vercel.json to link the project
  const verelJsonPath = path.join(__dirname, 'vercel.json');
  const tempVercelJson = {
    "projectName": PROJECT_NAME,
    "env": {
      "SUPABASE_URL": [
        {
          "value": CORRECT_SUPABASE_URL,
          "target": ["production"]
        }
      ]
    }
  };

  console.log('📝 Creating temporary vercel.json with corrected env...');
  fs.writeFileSync(verelJsonPath, JSON.stringify(tempVercelJson, null, 2));

  // Try using vercel env with the explicit value
  console.log('\n⏳ Attempting to set SUPABASE_URL via vercel CLI...\n');
  
  // Use a PowerShell approach to pipe the value
  const cmd = `
$correctUrl = '${CORRECT_SUPABASE_URL}'
Write-Host "Setting: $correctUrl"
npx vercel env add SUPABASE_URL production < $null 2>&1
`;

  // Actually, let's try the interactive way
  const result = execSync(
    `echo ${CORRECT_SUPABASE_URL} | npx vercel env add SUPABASE_URL production`,
    { 
      encoding: 'utf8', 
      stdio: 'pipe',
      cwd: __dirname,
      shell: 'powershell.exe',
      env: { ...process.env, VERCEL_PROJECT_NAME: PROJECT_NAME }
    }
  ).trim();

  console.log(result);
  console.log('\n✅ Environment variable updated!\n');

} catch (error) {
  console.error('\n❌ Automated approach failed. Trying alternative method...\n');
  
  console.log('📖 Manual instructions:\n');
  console.log('   1. Go to: https://vercel.com/dashboard');
  console.log('   2. Open project: victorysync-dashboard-server');
  console.log('   3. Click Settings → Environment Variables');
  console.log('   4. Set Production scope');
  console.log('   5. Edit SUPABASE_URL:');
  console.log(`      FROM: https://edsyhtlaqwilcxlorzca.supabase.co (wrong)`);
  console.log(`      TO:   ${CORRECT_SUPABASE_URL} (correct)`);
  console.log('   6. Save and Redeploy\n');

  console.log('💡 Or paste this in PowerShell if you have a token:\n');
  console.log(`   $env:VERCEL_TOKEN = "your_token"`);
  console.log(`   npx vercel env add SUPABASE_URL production\n`);
  
  console.log('Error details:', error.message);
}
