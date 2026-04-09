const request = require('supertest');
const { app } = require('../server');

describe('Backend System Tests', () => {
  it('should pass health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toHaveProperty('status', 'ok');
  });
});
