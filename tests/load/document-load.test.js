/**
 * K6 Load Test - Document CRUD Operations
 * Tests document service performance under load
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const documentCreateRate = new Rate('document_create_success');
const documentReadRate = new Rate('document_read_success');
const documentUpdateRate = new Rate('document_update_success');
const documentDeleteRate = new Rate('document_delete_success');
const documentListTrend = new Trend('document_list_duration');

// Load test configuration
export const options = {
  stages: [
    { duration: '1m', target: 50 },    // Warm up
    { duration: '3m', target: 200 },   // Peak load
    { duration: '1m', target: 0 },     // Cool down
  ],

  thresholds: {
    'http_req_duration': ['p(95)<800'],
    'http_req_failed': ['rate<0.02'],
    'document_create_success': ['rate>0.98'],
    'document_read_success': ['rate>0.99'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/documents';
let authToken;

export function setup() {
  // Setup: Create test user and get auth token
  const registerResponse = http.post(
    `${__ENV.BASE_URL || 'http://localhost:3000'}/auth/register`,
    JSON.stringify({
      email: `loadtest-${Date.now()}@example.com`,
      password: 'LoadTest123!',
      name: 'Load Test',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  return { token: JSON.parse(registerResponse.body).token };
}

export default function (data) {
  authToken = data.token;
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };

  let documentId;

  // Test 1: Create Document
  group('Create Document', () => {
    const payload = JSON.stringify({
      title: `Load Test Document ${__VU}-${__ITER}`,
      content: 'This is a test document created during load testing. '.repeat(10),
      tags: ['load-test', 'performance'],
    });

    const response = http.post(BASE_URL, payload, { headers });

    const success = check(response, {
      'create: status is 201': (r) => r.status === 201,
      'create: has document ID': (r) => JSON.parse(r.body).id !== undefined,
      'create: response time < 600ms': (r) => r.timings.duration < 600,
    });

    documentCreateRate.add(success);

    if (success) {
      documentId = JSON.parse(response.body).id;
    }
  });

  sleep(0.5);

  // Test 2: List Documents
  if (documentId) {
    group('List Documents', () => {
      const listResponse = http.get(`${BASE_URL}?page=1&limit=20`, { headers });

      check(listResponse, {
        'list: status is 200': (r) => r.status === 200,
        'list: returns array': (r) => Array.isArray(JSON.parse(r.body).documents),
        'list: pagination works': (r) => {
          const body = JSON.parse(r.body);
          return body.page && body.totalPages;
        },
        'list: response time < 400ms': (r) => r.timings.duration < 400,
      });

      documentListTrend.add(listResponse.timings.duration);
    });

    sleep(0.3);

    // Test 3: Read Document
    group('Read Document', () => {
      const readResponse = http.get(`${BASE_URL}/${documentId}`, { headers });

      const success = check(readResponse, {
        'read: status is 200': (r) => r.status === 200,
        'read: correct document': (r) => JSON.parse(r.body).id === documentId,
        'read: has content': (r) => JSON.parse(r.body).content !== undefined,
        'read: response time < 200ms': (r) => r.timings.duration < 200,
      });

      documentReadRate.add(success);
    });

    sleep(0.5);

    // Test 4: Update Document
    group('Update Document', () => {
      const updatePayload = JSON.stringify({
        title: `Updated Document ${__VU}-${__ITER}`,
        content: 'Updated content from load test',
      });

      const updateResponse = http.put(
        `${BASE_URL}/${documentId}`,
        updatePayload,
        { headers }
      );

      const success = check(updateResponse, {
        'update: status is 200': (r) => r.status === 200,
        'update: version incremented': (r) => {
          const body = JSON.parse(r.body);
          return body.version > 1;
        },
        'update: response time < 500ms': (r) => r.timings.duration < 500,
      });

      documentUpdateRate.add(success);
    });

    sleep(0.5);

    // Test 5: Delete Document
    group('Delete Document', () => {
      const deleteResponse = http.del(`${BASE_URL}/${documentId}`, { headers });

      const success = check(deleteResponse, {
        'delete: status is 200': (r) => r.status === 200,
        'delete: response time < 400ms': (r) => r.timings.duration < 400,
      });

      documentDeleteRate.add(success);
    });
  }

  sleep(1);
}
