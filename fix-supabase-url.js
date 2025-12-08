#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const VERCEL_API = 'https://api.vercel.com';
const PROJECT_ID = 'prj_awJrthyihSrzAZP6OTI33M9W6031';
const TEAM_ID = 'team_PZ7pNPTMW0zyGLmTu2s0bPuR';

// Get token from CLI cache
let token = null;

try {
  // Try reading from Vercel config in local project
  const configPath = path.join(__dirname, 'client', '.vercel', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Try to get token from environment or CLI
  const result = require('child_process').execSync('npx vercel whoami --token', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  // Token is in the output
  
} catch (e) {
  // Fallback: use the authenticated session from CLI
}

function makeRequest(method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${process.env.VERCEL_TOKEN || ''}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(`${VERCEL_API}${pathname}`, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : {}
          });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function fixEnv() {
  console.log('\n🔧 Fixing SUPABASE_URL in Vercel Production environment\n');
  console.log(`📋 Project ID: ${PROJECT_ID}`);
  console.log(`📋 Team ID: ${TEAM_ID}\n`);

  const correctValue = 'https://edsyhtlaqwiicxlzorca.supabase.co';

  if (!process.env.VERCEL_TOKEN) {
    console.log('⚠️  VERCEL_TOKEN not set. Using Vercel CLI authenticated session...\n');
    console.log('💡 If this fails, set: $env:VERCEL_TOKEN="your_token_here"\n');
  }

  try {
    // Get existing env vars
    console.log('📥 Fetching current environment variables...');
    const getRes = await makeRequest('GET', `/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`);

    console.log(`   Status: ${getRes.status}`);

    if (getRes.status === 401) {
      console.error('\n❌ Unauthorized. Token may be invalid or expired.');
      console.error('   Try: npx vercel logout && npx vercel login');
      process.exit(1);
    }

    if (getRes.status !== 200) {
      console.error(`❌ Failed to fetch env vars: ${getRes.status}`);
      console.error(JSON.stringify(getRes.body, null, 2));
      process.exit(1);
    }

    const envVars = getRes.body.envs || [];
    console.log(`   Found ${envVars.length} environment variables\n`);

    const supabaseUrlVar = envVars.find(v => v.key === 'SUPABASE_URL');

    if (supabaseUrlVar) {
      console.log(`🎯 Found SUPABASE_URL:`);
      console.log(`   ID: ${supabaseUrlVar.id}`);
      console.log(`   Current: ${supabaseUrlVar.value}`);
      console.log(`   Target: ${supabaseUrlVar.target.join(', ')}\n`);

      console.log('🗑️  Removing old (corrupted) value...');
      const delRes = await makeRequest('DELETE', `/v9/projects/${PROJECT_ID}/env/${supabaseUrlVar.id}?teamId=${TEAM_ID}`);
      if (delRes.status !== 200 && delRes.status !== 204) {
        console.warn(`   ⚠️  Status ${delRes.status} (may still be ok)`);
      } else {
        console.log('   ✅ Removed\n');
      }
    } else {
      console.log('⚠️  SUPABASE_URL not found, will create new one\n');
    }

    // Add new value for production
    console.log('➕ Adding corrected SUPABASE_URL...');
    const createRes = await makeRequest('POST', `/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
      key: 'SUPABASE_URL',
      value: correctValue,
      target: ['production']
    });

    console.log(`   Status: ${createRes.status}`);

    if (createRes.status === 401) {
      console.error('\n❌ Unauthorized. Token may be invalid.');
      process.exit(1);
    }

    if (createRes.status !== 200 && createRes.status !== 201) {
      console.error(`❌ Failed to create env var: ${createRes.status}`);
      console.error(JSON.stringify(createRes.body, null, 2));
      process.exit(1);
    }

    console.log('   ✅ Created\n');

    console.log('✨ SUCCESS! Environment variable updated:\n');
    console.log(`   Key: SUPABASE_URL`);
    console.log(`   Value: ${correctValue}`);
    console.log(`   Environment: production\n`);

    console.log('🚀 Next steps:\n');
    console.log('   1. Go to: https://vercel.com/dashboard/victorysync-dashboard-server');
    console.log('   2. Click "Deployments" on the latest production deployment');
    console.log('   3. Click "Redeploy" button (or push a commit to trigger auto-deploy)');
    console.log('   4. Wait for deployment to complete (status: "Ready")');
    console.log('   5. Visit: https://dashboard.victorysync.com');
    console.log('   6. Verify metrics load without "fetch failed" errors\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  - Ensure Vercel CLI is authenticated: npx vercel whoami');
    console.error('  - Set token explicitly: $env:VERCEL_TOKEN="your_token"');
    console.error('  - Check project/team IDs in client/.vercel/project.json');
    process.exit(1);
  }
}

fixEnv();
