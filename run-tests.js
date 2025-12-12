#!/usr/bin/env node
/**
 * Run all integration tests for the VictorySync Dashboard
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('\n' + '='.repeat(60));
console.log('🚀 VictorySync Dashboard - Full Integration Test Suite');
console.log('='.repeat(60) + '\n');

const tests = [
  {
    name: 'Client Configuration',
    command: 'node',
    args: ['test-client-config.js'],
    cwd: path.resolve(__dirname),
  },
  {
    name: 'Server API Tests',
    command: 'node',
    args: ['server/test-server.js'],
    cwd: path.resolve(__dirname),
  },
];

let passedTests = 0;
let failedTests = 0;

function runTest(test) {
  return new Promise((resolve) => {
    console.log(`\n📋 Running: ${test.name}`);
    console.log('-'.repeat(40));

    const proc = spawn(test.command, test.args, {
      cwd: test.cwd,
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        passedTests++;
        console.log(`✅ ${test.name} PASSED\n`);
      } else {
        failedTests++;
        console.log(`❌ ${test.name} FAILED\n`);
      }
      resolve(code === 0);
    });

    proc.on('error', (error) => {
      failedTests++;
      console.error(`❌ Error running ${test.name}: ${error.message}\n`);
      resolve(false);
    });
  });
}

async function runAllTests() {
  for (const test of tests) {
    await runTest(test);
  }

  console.log('='.repeat(60));
  console.log(`📊 Test Summary: ${passedTests} passed, ${failedTests} failed`);
  console.log('='.repeat(60) + '\n');

  if (failedTests === 0) {
    console.log('🎉 All tests passed! The application is working correctly.\n');
    console.log('Next steps:');
    console.log('1. Start the development server: npm run dev');
    console.log('2. Open your browser: http://localhost:5173');
    console.log('3. Login and verify the dashboard loads\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please review the errors above.\n');
    process.exit(1);
  }
}

runAllTests();
