/**
 * Tests for backend/routes/auth.js
 * Covers: register validation, login success/failure, account lockout,
 * /me auth guard, logout cookie clearing, and refresh token rotation.
 */

// ─── Env setup (must precede all requires) ───────────────────────────────────
process.env.PORT               = '3001';
process.env.JWT_SECRET         = 'test-jwt-secret-32-chars-minimum!!';
process.env.ENCRYPTION_KEY     = 'a'.repeat(64);
process.env.SUPABASE_URL       = 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY  = 'test-anon';
process.env.SUPABASE_SERVICE_KEY = 'test-service';
process.env.AWS_ACCESS_KEY_ID  = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION         = 'us-east-1';
process.env.S3_BUCKET_NAME     = 'test-bucket';
process.env.HDFS_WEBHDFS_URL   = 'http://localhost:9870';
process.env.AI_SERVICE_URL     = 'http://localhost:8000';

// ─── Mocks ───────────────────────────────────────────────────────────────────
jest.mock('../utils/supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: jest.fn(),
        getUserById: jest.fn()
      },
      signInWithPassword: jest.fn()
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null })
    }))
  }
}));

jest.mock('../utils/accountLockout', () => ({
  isAccountLocked:    jest.fn().mockResolvedValue(false),
  recordFailedLogin:  jest.fn().mockResolvedValue(undefined),
  clearFailedLogins:  jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../utils/hdfsLogger', () => ({
  logEvent: jest.fn().mockResolvedValue(undefined)
}));

// ─── Imports ─────────────────────────────────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const { app } = require('../server');
const { supabaseAdmin } = require('../utils/supabase');
const { isAccountLocked } = require('../utils/accountLockout');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const makeAccessCookie = (payload = {}) => {
  const token = jwt.sign(
    { sub: 'user-1', email: 'a@b.com', type: 'access', ...payload },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return `vaultiq_access_token=${token}`;
};

// ─── POST /api/auth/register ─────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  test('201 on valid input', async () => {
    supabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'uid-1', email: 'new@example.com' } },
      error: null
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'Test@1234', fullName: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'new@example.com' });
    // HttpOnly cookies must be set
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('vaultiq_access_token')])
    );
  });

  test('409 when email already exists', async () => {
    supabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: null,
      error: { message: 'User already registered' }
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'Test@1234', fullName: 'Bob' });

    expect(res.status).toBe(409);
  });

  test('400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'Test@1234', fullName: 'No Email' });

    expect(res.status).toBe(400);
  });

  test('400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@x.com', password: 'abc', fullName: 'Short' });

    expect(res.status).toBe(400);
  });

  test('400 when password lacks complexity (Fix 12)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@x.com', password: 'alllowercase1!', fullName: 'NoUpper' });

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  const mockProfileLookup = (id = null) => {
    supabaseAdmin.auth.admin.listUsers = jest.fn().mockResolvedValue({
      data: { users: id ? [{ id, email: 'a@b.com' }] : [] },
      error: null
    });
    supabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: id ? { id } : null })
    });
  };

  test('200 + cookies on valid credentials', async () => {
    mockProfileLookup('user-1');
    supabaseAdmin.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com' } },
      error: null
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'Test@1234' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe('user-1');
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('vaultiq_access_token'),
        expect.stringContaining('vaultiq_refresh_token')
      ])
    );
  });

  test('401 on wrong credentials', async () => {
    mockProfileLookup('user-1');
    supabaseAdmin.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' }
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'WrongPass1!' });

    expect(res.status).toBe(401);
  });

  test('423 when account is locked (Fix 10 — fail closed)', async () => {
    mockProfileLookup('user-1');
    isAccountLocked.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'AnyPass1!' });

    expect(res.status).toBe(423);
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  beforeEach(() => {
    supabaseAdmin.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: { full_name: 'Test User' } } },
      error: null
    });
  });

  test('200 with valid access token cookie', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', makeAccessCookie());

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: 'user-1', email: 'a@b.com' });
  });

  test('401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('401 with expired token', async () => {
    const expired = jwt.sign(
      { sub: 'user-1', email: 'a@b.com', type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: -1 }
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `vaultiq_access_token=${expired}`);

    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  test('200 and clears both cookies', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] || [];
    const cleared = cookies.filter(c => c.includes('Max-Age=0') || c.includes('Expires='));
    expect(cleared.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
describe('POST /api/auth/refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  const makeRefreshCookie = () => {
    const token = jwt.sign(
      { sub: 'user-1', type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    return `vaultiq_refresh_token=${token}`;
  };

  test('200 and issues new tokens', async () => {
    supabaseAdmin.auth.admin.getUserById.mockResolvedValue({
      data: { user: { email: 'a@b.com' } }
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', makeRefreshCookie());

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('vaultiq_access_token'),
        expect.stringContaining('vaultiq_refresh_token')
      ])
    );
  });

  test('401 when refresh token is missing', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  test('401 when refresh token is expired', async () => {
    const expired = jwt.sign(
      { sub: 'user-1', type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: -1 }
    );
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `vaultiq_refresh_token=${expired}`);

    expect(res.status).toBe(401);
  });

  test('401 when token type is not refresh', async () => {
    const wrongType = jwt.sign(
      { sub: 'user-1', type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `vaultiq_refresh_token=${wrongType}`);

    expect(res.status).toBe(401);
  });
});
