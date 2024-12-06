// tests/integration/app.test.js
const request = require('supertest');
const http = require('http');
const { app } = require('../../app'); // Import the app instance from app.js

describe('/healthz Endpoint Integration Test', () => {
  let server;

  // Create the server before running the tests
  beforeAll((done) => {
    server = http.createServer(app);
    server.listen(done);
  });

  // Close the server after running the tests
  afterAll((done) => {
    server.close(done);
  });

  it('should return 200 status and a healthy response', async () => {
    const response = await request(server).get('/healthz');
    expect(response.statusCode).toBe(200);
    // Expecting a plain 200 response, updating the expectation
    expect(response.text).toBe(''); // Ensure no body is returned in the response
  });

});
