/**
 * K6 Load Test - Authentication Endpoints
 * Tests auth service under realistic load
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const loginSuccessRate = new Rate('login_success');
const loginDuration = new Trend('login_duration');
const registerSuccessRate = new Rate('register_success');
const tokenRefreshRate = new Rate('token_refresh_success');
const errorCount = new Counter('errors');

// Test configuration
export const options = {
  // Load test configuration
  stages: [
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '3m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],

  // Performance thresholds
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    'http_req_failed': ['rate<0.01'], // Less than 1% errors
    'login_success': ['rate>0.99'],   // 99% login success
    'errors': ['count<100'],          // Less than 100 errors total
  },
};

// Base URL
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test data
let userCounter = 0;

function generateTestUser() {
  userCounter++;
  const timestamp = Date.now();
  return {
    email: `loadtest-${timestamp}-${userCounter}@example.com`,
    password: 'LoadTest123!',
    name: `Load Test User ${userCounter}`,
  };
}

// Main test function
export default function () {
  const user = generateTestUser();

  // Test 1: User Registration
  group('User Registration', () => {
    const registerPayload = JSON.stringify(user);
    const registerParams = {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'Register' },
    };

    const registerResponse = http.post(
      `${BASE_URL}/auth/register`,
      registerPayload,
      registerParams
    );

    const registerSuccess = check(registerResponse, {
      'register: status is 201': (r) => r.status === 201,
      'register: has token': (r) => {
        const body = JSON.parse(r.body);
        return body.token !== undefined;
      },
      'register: response time OK': (r) => r.timings.duration < 1000,
    });

    registerSuccessRate.add(registerSuccess);

    if (registerSuccess) {
      user.token = JSON.parse(registerResponse.body).token;
      user.refreshToken = JSON.parse(registerResponse.body).refreshToken;
    } else {
      errorCount.add(1);
      console.error(`Registration failed: ${registerResponse.status}`);
    }
  });

  sleep(1);

  // Test 2: User Login
  group('User Login', () => {
    const loginPayload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    const loginParams = {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'Login' },
    };

    const startTime = new Date();
    const loginResponse = http.post(
      `${BASE_URL}/auth/login`,
      loginPayload,
      loginParams
    );
    const duration = new Date() - startTime;

    const loginSuccess = check(loginResponse, {
      'login: status is 200': (r) => r.status === 200,
      'login: has token': (r) => {
        const body = JSON.parse(r.body);
        return body.token !== undefined;
      },
      'login: user data correct': (r) => {
        const body = JSON.parse(r.body);
        return body.user && body.user.email === user.email;
      },
      'login: response time < 500ms': (r) => r.timings.duration < 500,
    });

    loginSuccessRate.add(loginSuccess);
    loginDuration.add(duration);

    if (!loginSuccess) {
      errorCount.add(1);
    }
  });

  sleep(2);

  // Test 3: Get Current User (Protected Route)
  if (user.token) {
    group('Get Current User', () => {
      const meResponse = http.get(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${user.token}` },
        tags: { name: 'GetMe' },
      });

      check(meResponse, {
        'me: status is 200': (r) => r.status === 200,
        'me: returns user data': (r) => {
          const body = JSON.parse(r.body);
          return body.email === user.email;
        },
        'me: response time < 200ms': (r) => r.timings.duration < 200,
      });
    });

    sleep(1);
  }

  // Test 4: Token Refresh
  if (user.refreshToken) {
    group('Token Refresh', () => {
      const refreshPayload = JSON.stringify({
        refreshToken: user.refreshToken,
      });

      const refreshResponse = http.post(
        `${BASE_URL}/auth/refresh`,
        refreshPayload,
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'RefreshToken' },
        }
      );

      const refreshSuccess = check(refreshResponse, {
        'refresh: status is 200': (r) => r.status === 200,
        'refresh: returns new tokens': (r) => {
          const body = JSON.parse(r.body);
          return body.token && body.refreshToken;
        },
        'refresh: response time < 300ms': (r) => r.timings.duration < 300,
      });

      tokenRefreshRate.add(refreshSuccess);
    });
  }

  sleep(1);
}

// Setup function - runs once before test
export function setup() {
  console.log('🚀 Starting authentication load test...');
  console.log(`Target URL: ${BASE_URL}`);
  return { startTime: new Date() };
}

// Teardown function - runs once after test
export function teardown(data) {
  const duration = Math.floor((new Date() - data.startTime) / 1000);
  console.log(`✅ Load test completed in ${duration} seconds`);
}
