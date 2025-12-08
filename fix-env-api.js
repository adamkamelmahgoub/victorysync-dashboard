#!/usr/bin/env node

/**
 * Direct API fix for corrupted SUPABASE_URL in Vercel
 * Uses REST API instead of CLI
 */

const https = require('https');

const VERCEL_API = 'https://api.vercel.com';
const PROJECT_ID = 'prj_GvDFQe3D8tU84H0qeaYlF3Ac'; // victorysync-dashboard-server
const TEAM_ID = 'team_LvC1OAHRSg3dV8g5n5kKiKPQ'; // adam-mahgoubs-projects

// Get token from environment or .vercel/auth.json
const fs = require('fs');
const path = require('path');

let token = process.env.VERCEL_TOKEN;

if (!token) {
  try {
    const authFile = path.join(process.env.HOME || process.env.USERPROFILE, '.vercel', 'auth.json');
    const authData = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    token = authData.token;
  } catch (e) {
    console.error('❌ Could not find Vercel token. Please set VERCEL_TOKEN environment variable or ensure .vercel/auth.json exists.');
    process.exit(1);
  }
}

const correctValue = 'https://edsyhtlaqwiicxlzorca.supabase.co';

function makeRequest(method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
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
            body: data ? JSON.parse(data) : {}
          });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function fixEnv() {
  console.log('\n🔧 Fixing SUPABASE_URL in Vercel via API...\n');

  try {
    // Get existing env vars
    console.log('📋 Fetching current environment variables...');
    const getRes = await makeRequest('GET', `/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`);

    if (getRes.status !== 200) {
      console.error(`❌ Failed to fetch env vars: ${getRes.status}`);
      console.error(getRes.body);
      process.exit(1);
    }

    const envVars = getRes.body.envs || [];
    const supabaseUrlVar = envVars.find(v => v.key === 'SUPABASE_URL');

    if (!supabaseUrlVar) {
      console.log('⚠️  SUPABASE_URL not found in environment. Creating new one...');
    } else {
      console.log(`📌 Found SUPABASE_URL with ID: ${supabaseUrlVar.id}`);
      console.log(`   Current value: ${supabaseUrlVar.value}`);
    }

    // If exists, delete old one
    if (supabaseUrlVar) {
      console.log('\n🗑️  Removing old value...');
      const delRes = await makeRequest('DELETE', `/v9/projects/${PROJECT_ID}/env/${supabaseUrlVar.id}?teamId=${TEAM_ID}`);
      if (delRes.status !== 200 && delRes.status !== 204) {
        console.warn(`⚠️  Warning deleting: ${delRes.status}`);
      } else {
        console.log('✅ Old value removed');
      }
    }

    // Add new value for production
    console.log('\n➕ Adding corrected SUPABASE_URL for production...');
    const createRes = await makeRequest('POST', `/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
      key: 'SUPABASE_URL',
      value: correctValue,
      target: ['production']
    });

    if (createRes.status !== 200 && createRes.status !== 201) {
      console.error(`❌ Failed to create env var: ${createRes.status}`);
      console.error(createRes.body);
      process.exit(1);
    }

    console.log('✅ Successfully set SUPABASE_URL to:');
    console.log(`   ${correctValue}\n`);

    console.log('🚀 Next steps:');
    console.log('   1. Trigger a redeploy in Vercel dashboard (push a commit or click Redeploy)');
    console.log('   2. Wait for deployment to complete');
    console.log('   3. Visit https://dashboard.victorysync.com to verify metrics load\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixEnv();
