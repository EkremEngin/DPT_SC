/**
 * Performance Test Runner using Autocannon
 * 
 * Node-native HTTP benchmarking tool
 * Tests critical API endpoints and validates performance thresholds
 * 
 * Usage:
 *   npm run perf:run
 * 
 * Thresholds:
 * - p95 latency < 300ms
 * - Error rate < 1%
 */

import autocannon from 'autocannon';
import { logger } from '../utils/logger';

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const AUTH_CREDENTIALS = {
  username: process.env.PERF_AUTH_USERNAME || 'Ekoreiz54',
  password: process.env.PERF_AUTH_PASSWORD || 'Ekoreiz54!',
};

// Performance thresholds
const THRESHOLDS = {
  P95_LATENCY_MS: 300,
  MAX_ERROR_RATE: 0.01, // 1%
};

interface TestResult {
  name: string;
  passed: boolean;
  p95: number;
  p99: number;
  avg: number;
  rps: number;
  errorRate: number;
  errors: number;
}

let authToken: string | null = null;

/**
 * Login to get authentication token
 */
async function login(): Promise<string> {
  logger.info('Logging in to get auth token...');
  
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(AUTH_CREDENTIALS),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  const data = await response.json();
  return data.accessToken;
}

/**
 * Helper to run autocannon and extract metrics
 */
function runAutocannon(opts: {
  url: string;
  connections: number;
  duration: number;
}): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      ...opts,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    }, (err: Error | null, result: any) => {
      if (err) {
        reject(err);
        return;
      }

      // Extract metrics from autocannon result
      const avg = result.latency?.mean || 0;
      const p95 = result.latency?.p95 || 0;
      const p99 = result.latency?.p99 || 0;
      const rps = result.requests?.mean || 0;
      const errors = result.errors || 0;
      const totalRequests = result.requests?.completed || 1;
      const errorRate = errors / totalRequests;

      resolve({
        name: opts.url,
        passed: false,
        avg,
        p95,
        p99,
        rps,
        errors,
        errorRate,
      });
    });
  });
}

/**
 * Test GET /api/companies endpoint
 */
async function testCompanies(): Promise<TestResult> {
  logger.info('Testing GET /api/companies...');
  
  const result = await runAutocannon({
    url: `${BASE_URL}/api/companies?page=1&limit=20`,
    connections: 10,
    duration: 10,
  });

  const passed = result.p95 < THRESHOLDS.P95_LATENCY_MS && 
                 result.errorRate < THRESHOLDS.MAX_ERROR_RATE;

  return {
    ...result,
    name: 'GET /api/companies',
    passed,
  };
}

/**
 * Test GET /api/leases endpoint
 */
async function testLeases(): Promise<TestResult> {
  logger.info('Testing GET /api/leases...');
  
  const result = await runAutocannon({
    url: `${BASE_URL}/api/leases?page=1&limit=20`,
    connections: 10,
    duration: 10,
  });

  const passed = result.p95 < THRESHOLDS.P95_LATENCY_MS && 
                 result.errorRate < THRESHOLDS.MAX_ERROR_RATE;

  return {
    ...result,
    name: 'GET /api/leases',
    passed,
  };
}

/**
 * Test GET /api/leases/details endpoint
 */
async function testLeasesDetails(): Promise<TestResult> {
  logger.info('Testing GET /api/leases/details...');
  
  const result = await runAutocannon({
    url: `${BASE_URL}/api/leases/details`,
    connections: 5,
    duration: 10,
  });

  // Allow slightly higher p95 for details endpoint (complex query)
  const passed = result.p95 < (THRESHOLDS.P95_LATENCY_MS * 1.5) && 
                 result.errorRate < THRESHOLDS.MAX_ERROR_RATE;

  return {
    ...result,
    name: 'GET /api/leases/details',
    passed,
  };
}

/**
 * Test GET /api/dashboard endpoint
 */
async function testDashboard(): Promise<TestResult> {
  logger.info('Testing GET /api/dashboard...');
  
  const result = await runAutocannon({
    url: `${BASE_URL}/api/dashboard`,
    connections: 5,
    duration: 10,
  });

  // Allow slightly higher p95 for dashboard (complex aggregations)
  const passed = result.p95 < (THRESHOLDS.P95_LATENCY_MS * 1.5) && 
                 result.errorRate < THRESHOLDS.MAX_ERROR_RATE;

  return {
    ...result,
    name: 'GET /api/dashboard',
    passed,
  };
}

/**
 * Print test result
 */
function printResult(result: TestResult): void {
  const status = result.passed ? '✅ PASS' : '❌ FAIL';
  const statusColor = result.passed ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  
  console.log(`\n${statusColor}${status}${reset} ${result.name}`);
  console.log(`   Avg: ${result.avg.toFixed(2)}ms`);
  console.log(`   p95: ${result.p95.toFixed(2)}ms`);
  console.log(`   p99: ${result.p99.toFixed(2)}ms`);
  console.log(`   RPS: ${result.rps.toFixed(2)}`);
  console.log(`   Errors: ${result.errors} (${(result.errorRate * 100).toFixed(2)}%)`);
}

/**
 * Main performance test runner
 */
async function runPerformanceTests(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        DPT-Local Performance Baseline Test                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget: ${BASE_URL}`);
  console.log(`Thresholds: p95 < ${THRESHOLDS.P95_LATENCY_MS}ms, errors < ${(THRESHOLDS.MAX_ERROR_RATE * 100)}%\n`);

  try {
    // Login first
    authToken = await login();
    console.log('✅ Auth token acquired\n');

    // Run all tests
    const results: TestResult[] = [
      await testCompanies(),
      await testLeases(),
      await testLeasesDetails(),
      await testDashboard(),
    ];

    // Print summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                      Summary                                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const allPassed = results.every(r => r.passed);
    const passCount = results.filter(r => r.passed).length;

    results.forEach(printResult);

    console.log(`\n${allPassed ? '✅' : '❌'} Overall: ${passCount}/${results.length} tests passed`);

    // Exit with appropriate code
    if (allPassed) {
      console.log('\n✅ All performance tests passed!\n');
      process.exit(0);
    } else {
      console.log('\n❌ Some performance tests failed. See details above.\n');
      process.exit(1);
    }

  } catch (error) {
    logger.error({ error }, 'Performance test failed');
    console.error('\n❌ Fatal error during performance tests:');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runPerformanceTests();
}

export { runPerformanceTests };
