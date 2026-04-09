jest.mock('axios');

describe('hdfsLogger', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  // test_1: logEvent does not throw when both HDFS and Supabase are unavailable
  test('does not throw when both HDFS and Supabase are unavailable', async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      HDFS_WEBHDFS_URL: 'http://localhost:9870/webhdfs/v1',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_KEY: 'test-key'
    };

    const axios = require('axios');
    axios.put = jest.fn().mockRejectedValue(new Error('HDFS unreachable'));
    axios.post = jest.fn().mockRejectedValue(new Error('Supabase unreachable'));

    const { logEvent } = require('../utils/hdfsLogger');

    await expect(logEvent('file_upload', { userId: 'u1' })).resolves.toBeUndefined();
  });

  // test_2: logEvent calls _writeToSupabase when HDFS_WEBHDFS_URL env var is not set
  test('calls Supabase directly when HDFS_WEBHDFS_URL is not set', async () => {
    jest.resetModules();
    const env = { ...originalEnv };
    delete env.HDFS_WEBHDFS_URL;
    process.env = {
      ...env,
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_KEY: 'test-key'
    };

    const axios = require('axios');
    axios.put = jest.fn();
    axios.post = jest.fn().mockResolvedValue({ status: 201 });

    const { logEvent } = require('../utils/hdfsLogger');

    await logEvent('file_download', { userId: 'u2', fileName: 'doc.pdf' });

    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][0]).toContain('/rest/v1/event_logs');
  });

  // test_3: logEvent calls _writeToHDFS first, falls back to Supabase if HDFS throws
  test('tries HDFS first and falls back to Supabase when HDFS throws', async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      HDFS_WEBHDFS_URL: 'http://localhost:9870/webhdfs/v1',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_KEY: 'test-key'
    };

    const axios = require('axios');
    // HDFS PUT fails with a non-403 error, triggering fallback
    axios.put = jest.fn().mockRejectedValue(new Error('Connection refused'));
    axios.post = jest.fn().mockResolvedValue({ status: 201 });

    const { logEvent } = require('../utils/hdfsLogger');

    await logEvent('file_delete', { userId: 'u3' });

    // HDFS PUT was attempted
    expect(axios.put).toHaveBeenCalled();
    // Supabase POST was called as fallback
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][0]).toContain('/rest/v1/event_logs');
  });

  // test_4: logEvent builds the correct log path with today's UTC date in YYYY-MM-DD format
  test('builds log path with today UTC date in YYYY-MM-DD format', async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      HDFS_WEBHDFS_URL: 'http://localhost:9870/webhdfs/v1',
      HDFS_USER: 'hadoop',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_KEY: 'test-key'
    };

    const axios = require('axios');
    axios.put = jest.fn().mockResolvedValue({ status: 201 });
    axios.post = jest.fn().mockResolvedValue({ status: 200 });

    const { logEvent } = require('../utils/hdfsLogger');

    await logEvent('ai_detection', { userId: 'u4' });

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const putUrl = axios.put.mock.calls[0][0];
    expect(putUrl).toContain(`/vaultiq/logs/${today}/events.jsonl`);
  });
});
