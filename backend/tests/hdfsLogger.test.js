// hdfsLogger: logEvent queues to Redis; flushEventBatch drains the queue to
// HDFS (primary) with Supabase as fallback, re-queueing if both fail.

jest.mock('axios');

// In-memory stand-in for the Redis list used as the event queue
jest.mock('redis', () => {
  const list = [];
  const client = {
    list,
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(),
    quit: jest.fn().mockResolvedValue(),
    lPush: jest.fn(async (_key, value) => list.unshift(value)),
    rPop: jest.fn(async () => (list.length ? list.pop() : null)),
    lLen: jest.fn(async () => list.length),
  };
  return { createClient: () => client };
});

describe('hdfsLogger', () => {
  const originalEnv = process.env;

  // Module reads env at load time, so reload it for every test
  function loadLogger(env) {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_KEY: 'test-key',
      ...env,
    };
    const axios = require('axios');
    axios.put = jest.fn().mockResolvedValue({ status: 201 });
    axios.post = jest.fn().mockResolvedValue({ status: 201 });
    const redisClient = require('redis').createClient();
    const logger = require('../utils/hdfsLogger');
    return { ...logger, axios, redisClient };
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('logEvent queues a normalised event in Redis', async () => {
    const { logEvent, redisClient } = loadLogger({});

    await logEvent('file_download', { userId: 'u2', fileName: 'doc.pdf', durationMs: 12 });

    expect(redisClient.list).toHaveLength(1);
    const event = JSON.parse(redisClient.list[0]);
    expect(event).toMatchObject({
      event_type: 'file_download',
      user_id: 'u2',
      latency_ms: 12,
      metadata: expect.objectContaining({ file_name: 'doc.pdf' }),
    });
    expect(event.timestamp).toEqual(expect.any(String));
  });

  test('logEvent does not throw when Redis is unavailable', async () => {
    const { logEvent, redisClient } = loadLogger({});
    redisClient.lPush.mockRejectedValueOnce(new Error('Redis down'));
    redisClient.lLen.mockRejectedValueOnce(new Error('Redis down'));

    await expect(logEvent('file_upload', { userId: 'u1' })).resolves.toBeUndefined();
  });

  test('flush writes to Supabase directly when HDFS is disabled', async () => {
    const { logEvent, flushEventBatch, axios } = loadLogger({ HDFS_ENABLED: 'false' });

    await logEvent('file_download', { userId: 'u2' });
    await flushEventBatch();

    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][0]).toBe('http://localhost:54321/rest/v1/event_logs');
    expect(axios.post.mock.calls[0][1]).toHaveLength(1);
  });

  test('flush appends to HDFS and skips Supabase when HDFS succeeds', async () => {
    const { logEvent, flushEventBatch, axios } = loadLogger({
      HDFS_ENABLED: 'true',
      HDFS_WEBHDFS_URL: 'http://localhost:9870/webhdfs/v1',
    });

    await logEvent('file_upload', { userId: 'u1' });
    await flushEventBatch();

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][0]).toContain('op=APPEND');
  });

  test('flush falls back to Supabase when HDFS is unreachable', async () => {
    const { logEvent, flushEventBatch, axios } = loadLogger({
      HDFS_ENABLED: 'true',
      HDFS_WEBHDFS_URL: 'http://localhost:9870/webhdfs/v1',
    });
    axios.post
      .mockRejectedValueOnce(new Error('Connection refused')) // HDFS APPEND
      .mockResolvedValueOnce({ status: 201 });                // Supabase

    await logEvent('file_delete', { userId: 'u3' });
    await flushEventBatch();

    expect(axios.put).not.toHaveBeenCalled(); // network error is not a "file missing" error
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[1][0]).toContain('/rest/v1/event_logs');
  });

  test('creates today\'s HDFS log file when APPEND reports it missing', async () => {
    const { logEvent, flushEventBatch, axios } = loadLogger({
      HDFS_ENABLED: 'true',
      HDFS_WEBHDFS_URL: 'http://localhost:9870/webhdfs/v1',
      HDFS_USER: 'hadoop',
    });
    axios.post.mockRejectedValueOnce(Object.assign(new Error('Not found'), { response: { status: 404 } }));

    await logEvent('ai_detection', { userId: 'u4' });
    await flushEventBatch();

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    expect(axios.put).toHaveBeenCalledTimes(1);
    const putUrl = axios.put.mock.calls[0][0];
    expect(putUrl).toContain(`/vaultiq/logs/${today}/events.jsonl`);
    expect(putUrl).toContain('op=CREATE');
    expect(putUrl).toContain('user.name=hadoop');
  });

  test('re-queues events when both HDFS and Supabase fail', async () => {
    const { logEvent, flushEventBatch, axios, redisClient } = loadLogger({ HDFS_ENABLED: 'false' });
    axios.post.mockRejectedValue(new Error('Supabase unreachable'));

    await logEvent('file_upload', { userId: 'u1' });
    await logEvent('file_upload', { userId: 'u2' });
    await flushEventBatch();

    expect(redisClient.list).toHaveLength(2);
  });
});
