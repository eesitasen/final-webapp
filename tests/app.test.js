// tests/app.test.js

const request = require("supertest");
const app = require("../app");

describe("User Registration POST /v1/user", () => {
  it("Should create a user with valid data", async () => {
    const response = await request(app).post("/v1/user").send({
      first_name: "Alice",
      last_name: "Smith",
      email: "alice@example.com",
      password: "securepassword",
    });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("User Created");
    expect(response.body.data).toHaveProperty("id");
    expect(response.body.data.email).toBe("alice@example.com");
  });

  it("Should return 400 Bad Request for missing fields", async () => {
    const response = await request(app).post("/v1/user").send({
      first_name: "Alice",
      email: "alice@example.com",
    });

    expect(response.status).toBe(400);
  });
});
