// tests/unit/validateHealthzRequest.test.js
const { validateHealthzRequest } = require('../../app');

describe('validateHealthzRequest', () => {

  it('should return valid if no content-type, query, body, and method is not HEAD', () => {
    const req = {
      method: 'GET',
      headers: {},
      body: {},
      query: {},
    };

    const result = validateHealthzRequest(req);
    expect(result).toEqual({ valid: true });
  });

  it('should return 405 error for HEAD request', () => {
    const req = {
      method: 'HEAD',
      headers: {},
      body: {},
      query: {},
    };

    const result = validateHealthzRequest(req);
    expect(result).toEqual({
      valid: false,
      statusCode: 405,
      message: "Method Not Allowed",
    });
  });

  it('should return 400 error if content-type is present', () => {
    const req = {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
      },
      body: {},
      query: {},
    };

    const result = validateHealthzRequest(req);
    expect(result).toEqual({
      valid: false,
      statusCode: 400,
      message: "Bad Request",
    });
  });

  it('should return 400 error if body is present', () => {
    const req = {
      method: 'GET',
      headers: {},
      body: {
        key: 'value',
      },
      query: {},
    };

    const result = validateHealthzRequest(req);
    expect(result).toEqual({
      valid: false,
      statusCode: 400,
      message: "Bad Request",
    });
  });

  it('should return 400 error if query parameters are present', () => {
    const req = {
      method: 'GET',
      headers: {},
      body: {},
      query: {
        key: 'value',
      },
    };

    const result = validateHealthzRequest(req);
    expect(result).toEqual({
      valid: false,
      statusCode: 400,
      message: "Bad Request",
    });
  });

});
