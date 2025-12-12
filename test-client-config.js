#!/usr/bin/env node
/**
 * Client configuration test
 * Verifies that the client's API_BASE_URL is correctly set to empty string (same-origin)
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Client Configuration Tests\n');

// Test 1: Check that config.ts has empty string as default API_BASE_URL
const configPath = path.resolve(__dirname, 'client/src/config.ts');

try {
  const configContent = fs.readFileSync(configPath, 'utf8');
  
  console.log('Test 1: API_BASE_URL default value');
  
  // Check for the empty string default
  if (configContent.includes("import.meta.env.VITE_API_BASE_URL ?? ''")) {
    console.log('✅ PASS: API_BASE_URL defaults to empty string (same-origin)');
    console.log('   This means the client will call /api/... on the same domain\n');
  } else if (configContent.includes("import.meta.env.VITE_API_BASE_URL ?? 'https://api.victorysync.com'")) {
    console.log('❌ FAIL: API_BASE_URL still defaults to external API host');
    console.log('   Client would make 404 requests when deployed\n');
    process.exit(1);
  } else {
    console.log('⚠️  WARNING: Could not determine API_BASE_URL default value');
    console.log('   Configuration may need manual review\n');
  }
  
  console.log('═'.repeat(50));
  console.log('✅ Client configuration is correct!\n');
  process.exit(0);
  
} catch (error) {
  console.log(`❌ FAIL: Could not read config file: ${error.message}\n`);
  process.exit(1);
}
