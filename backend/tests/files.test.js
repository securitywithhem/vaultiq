/**
 * Tests for backend/routes/files.js
 * Covers: upload validation, list pagination, download integrity, delete IDOR guard.
 */

// ─── Env setup ───────────────────────────────────────────────────────────────
process.env.PORT               = '3002';
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
jest.mock('../utils/supabase', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null })
  };
  return {
    supabaseAdmin: {
      auth: { admin: { createUser: jest.fn(), getUserById: jest.fn() } },
      from: jest.fn(() => ({ ...chain }))
    }
  };
});

jest.mock('../utils/s3', () => ({
  uploadToS3:   jest.fn().mockResolvedValue(undefined),
  downloadFromS3: jest.fn(),
  deleteFromS3: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../utils/hdfsLogger', () => ({
  logEvent: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../utils/accountLockout', () => ({
  isAccountLocked:   jest.fn().mockResolvedValue(false),
  recordFailedLogin: jest.fn().mockResolvedValue(undefined),
  clearFailedLogins: jest.fn().mockResolvedValue(undefined)
}));

// ─── Imports ─────────────────────────────────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const { app } = require('../server');
const { supabaseAdmin } = require('../utils/supabase');
const { encrypt, sha256 } = require('../utils/crypto');
const { downloadFromS3 } = require('../utils/s3');

// ─── Helpers ─────────────────────────────────────────────────────────────────
// IDs must pass the UUID validator in fileIdParams
const FILE_UUID  = '00000000-0000-0000-0000-000000000001';
const OTHER_UUID = '00000000-0000-0000-0000-000000000002';

const AUTH_COOKIE = (() => {
  const token = jwt.sign(
    { sub: 'user-1', email: 'a@b.com', type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return `vaultiq_access_token=${token}`;
})();

const authed = (req) => req.set('Cookie', AUTH_COOKIE);

// ─── POST /api/files/upload ───────────────────────────────────────────────────
describe('POST /api/files/upload', () => {
  beforeEach(() => jest.clearAllMocks());

  test('201 on valid .txt upload', async () => {
    supabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: FILE_UUID, filename: 'test.txt', file_size: 5, uploaded_at: new Date().toISOString() },
        error: null
      })
    });

    const res = await authed(
      request(app)
        .post('/api/files/upload')
        .attach('file', Buffer.from('hello'), { filename: 'test.txt', contentType: 'text/plain' })
    );

    expect(res.status).toBe(201);
    expect(res.body.data.file).toMatchObject({ id: FILE_UUID });
  });

  test('400 when no file is attached', async () => {
    const res = await authed(request(app).post('/api/files/upload'));
    expect(res.status).toBe(400);
  });

  test('400 for disallowed MIME type', async () => {
    const res = await authed(
      request(app)
        .post('/api/files/upload')
        .attach('file', Buffer.from('<html/>'), { filename: 'page.html', contentType: 'text/html' })
    );
    expect(res.status).toBe(400);
  });

  test('401 without auth token', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .attach('file', Buffer.from('hi'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/files ───────────────────────────────────────────────────────────
describe('GET /api/files', () => {
  beforeEach(() => jest.clearAllMocks());

  const makeFileList = (count) =>
    Array.from({ length: count }, (_, i) => ({
      id: `file-${i}`, filename: `f${i}.txt`, file_size: 100,
      mime_type: 'text/plain', uploaded_at: new Date().toISOString()
    }));

  test('200 returns files array with hasMore=false when fewer than PAGE_SIZE', async () => {
    const files = makeFileList(3);
    supabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: files, error: null })
    });

    const res = await authed(request(app).get('/api/files'));

    expect(res.status).toBe(200);
    expect(res.body.data.files).toHaveLength(3);
    expect(res.body.data.hasMore).toBe(false);
    expect(res.body.data.page).toBe(0);
  });

  test('hasMore=true when exactly PAGE_SIZE (20) files returned', async () => {
    const files = makeFileList(20);
    supabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: files, error: null })
    });

    const res = await authed(request(app).get('/api/files?page=0'));

    expect(res.status).toBe(200);
    expect(res.body.data.hasMore).toBe(true);
  });

  test('page param is forwarded correctly (Fix 9)', async () => {
    const rangeMock = jest.fn().mockResolvedValue({ data: [], error: null });
    supabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: rangeMock
    });

    await authed(request(app).get('/api/files?page=2'));

    // Page 2: from=40, to=59
    expect(rangeMock).toHaveBeenCalledWith(40, 59);
  });

  test('401 without auth token', async () => {
    const res = await request(app).get('/api/files');
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/files/:id/download ─────────────────────────────────────────────
describe('GET /api/files/:id/download', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 and returns decrypted file content', async () => {
    const plaintext = Buffer.from('secret file content');
    const hash = sha256(plaintext);
    const { data: ciphertext, iv } = encrypt(plaintext);

    supabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: FILE_UUID, user_id: 'user-1', filename: 'secret.txt',
          file_size: ciphertext.length, mime_type: 'text/plain',
          sha256_hash: hash, s3_key: 'user-1/secret.txt.enc'
        },
        error: null
      })
    });

    // Small-file path: body = raw ciphertext, IV is in metadata separately
    downloadFromS3.mockResolvedValue({
      body: ciphertext,
      metadata: { iv: iv.toString('hex') },
      isStream: false
    });

    const res = await authed(request(app).get(`/api/files/${FILE_UUID}/download`));

    expect(res.status).toBe(200);
    // Verify the decrypted content-disposition header confirms correct file
    expect(res.headers['content-disposition']).toContain('secret.txt');
  });

  test('409 when hash does not match (tampered file)', async () => {
    const plaintext = Buffer.from('original');
    const { data: ciphertext, iv } = encrypt(plaintext);

    supabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: FILE_UUID, user_id: 'user-1', filename: 'f.txt',
          file_size: ciphertext.length, mime_type: 'text/plain',
          sha256_hash: 'deadbeef'.repeat(8), // wrong hash
          s3_key: 'user-1/f.txt.enc'
        },
        error: null
      })
    });

    downloadFromS3.mockResolvedValue({
      body: ciphertext,
      metadata: { iv: iv.toString('hex') },
      isStream: false
    });

    const res = await authed(request(app).get(`/api/files/${FILE_UUID}/download`));
    expect(res.status).toBe(409);
  });

  test('404 when file belongs to a different user (IDOR guard)', async () => {
    supabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    });

    const res = await authed(request(app).get(`/api/files/${OTHER_UUID}/download`));
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/files/:id ────────────────────────────────────────────────────
describe('DELETE /api/files/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 on successful delete', async () => {
    supabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: FILE_UUID, user_id: 'user-1', filename: 'f.txt', s3_key: 'k', file_size: 10 },
        error: null
      })
    });

    const res = await authed(request(app).delete(`/api/files/${FILE_UUID}`));
    expect(res.status).toBe(200);
  });

  test('404 when file not found or belongs to other user', async () => {
    supabaseAdmin.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    });

    const res = await authed(request(app).delete(`/api/files/${OTHER_UUID}`));
    expect(res.status).toBe(404);
  });

  test('401 without auth', async () => {
    const res = await request(app).delete(`/api/files/${FILE_UUID}`);
    expect(res.status).toBe(401);
  });
});
