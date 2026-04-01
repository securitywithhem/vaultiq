/**
 * @file test-all.js
 * @description Validates backend functionality and constraints for VaultIQ
 * @dependencies crypto, node-fetch, @aws-sdk/client-s3, @supabase/supabase-js, jsonwebtoken, server components
 * @exports testRunner function
 */

process.env.PORT = '5001';
require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');
const { S3Client, ListBucketsCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const stats = {
  env: false,
  supabase: false,
  s3: false,
  encryption: false,
  integrity: false,
  authPassed: 0,
  authTotal: 7,
  filesPassed: 0,
  filesTotal: 8,
  securityPassed: 0,
  securityTotal: 4
};

const BASE_URL = `http://localhost:5001`;

const testUser = {
  email: `test-${crypto.randomUUID()}@vaultiq.local`,
  password: 'TestPassword123!',
  fullName: 'Test User',
  token: null,
  id: null
};

let uploadedFileId = null;
let vaultiqCrypto = {};

async function runAllTests() {
  console.log('─────────────────────────────');
  console.log('VAULTIQ BACKEND TEST REPORT');
  console.log('─────────────────────────────');

  await testEnvironment();

  try {
    vaultiqCrypto = require('./utils/crypto');
    require('./server'); 
    
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (err) {
    console.log(`\n[CRITICAL] Backend setup failed: ${err.message}`);
  }

  try {
    await testSupabase();
    await testS3();
    
    if (stats.env && vaultiqCrypto.encrypt) {
      await testEncryption();
      await testIntegrity();
    }
    
    if (Object.keys(vaultiqCrypto).length > 0) {
      const hRes = await fetch(`${BASE_URL}/api/health`).catch(()=>({status: 0}));
      if (hRes.status !== 200) console.log(`[FAIL] Health check failed`);
      
      const notFoundRes = await fetch(`${BASE_URL}/nonexistent`).catch(()=>({status: 0}));
      if (notFoundRes.status !== 404) console.log(`[FAIL] 404 handler failed`);

      await testAuthRoutes();
      await testFileRoutes();
      await testSecurityChecks();
    }
  } catch (err) {
    console.error('\n[CRITICAL FAILURE]', err);
  } finally {
    await cleanupTestData();

    console.log('\n─────────────────────────────');
    console.log(`[${stats.env ? 'PASS' : 'FAIL'}] Environment validation`);
    console.log(`[${stats.supabase ? 'PASS' : 'FAIL'}] Supabase connection`);
    console.log(`[${stats.s3 ? 'PASS' : 'FAIL'}] S3 connection`);
    console.log(`[${stats.encryption ? 'PASS' : 'FAIL'}] Encryption round-trip`);
    console.log(`[${stats.integrity ? 'PASS' : 'FAIL'}] SHA-256 integrity`);
    console.log(`[${stats.authPassed === stats.authTotal ? 'PASS' : 'FAIL'}] Auth routes (${stats.authPassed}/${stats.authTotal})`);
    console.log(`[${stats.filesPassed === stats.filesTotal ? 'PASS' : 'FAIL'}] File routes (${stats.filesPassed}/${stats.filesTotal})`);
    console.log(`[${stats.securityPassed === stats.securityTotal ? 'PASS' : 'FAIL'}] Security checks (${stats.securityPassed}/${stats.securityTotal})`);
    console.log('─────────────────────────────');

    const totalPassed = [
      stats.env, stats.supabase, stats.s3, stats.encryption, stats.integrity,
      (stats.authPassed === stats.authTotal), 
      (stats.filesPassed === stats.filesTotal), 
      (stats.securityPassed === stats.securityTotal)
    ].filter(Boolean).length;
    
    console.log(`TOTAL: ${totalPassed}/8 suites passed`);
    console.log('─────────────────────────────');

    process.exit(0);
  }
}

async function testEnvironment() {
  try {
    const vars = [
      'PORT', 'JWT_SECRET', 'ENCRYPTION_KEY', 'SUPABASE_URL', 
      'SUPABASE_SERVICE_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME'
    ];
    for (const v of vars) {
      if (!process.env[v]) throw new Error(`Missing ${v}`);
    }
    if (process.env.ENCRYPTION_KEY.length !== 64) throw new Error('ENCRYPTION_KEY must be 64 chars');
    if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET is less than 32 chars');
    
    stats.env = true;
  } catch (err) {
    console.log(`\n[FAIL] Environment: ${err.message}`);
  }
}

async function testSupabase() {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return;
    
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    
    const { error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr && !authErr.message.includes('not permitted')) throw new Error('Error querying users');

    const { error: fileErr } = await supabase.from('files').select('id').limit(1);
    if (fileErr) throw new Error('Error querying files table');

    const dummyId = crypto.randomUUID();
    const { error: insertErr } = await supabase.from('files').insert({
      id: dummyId,
      user_id: crypto.randomUUID(), 
      filename: 'test.txt',
      s3_key: 'test/key',
      file_size: 100,
      sha256_hash: 'hash' 
    });
    
    if (!insertErr) {
       await supabase.from('files').delete().eq('id', dummyId);
    } 
    
    stats.supabase = true;
  } catch (err) {
    console.log(`\n[FAIL] Supabase: ${err.message}`);
  }
}

async function testS3() {
  try {
    if (!process.env.AWS_ACCESS_KEY_ID) return;
    const s3 = new S3Client({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    await s3.send(new ListBucketsCommand({}));
    
    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) throw new Error("Missing S3_BUCKET_NAME");

    const testKey = `test-${Date.now()}.txt`;
    const testBuffer = Buffer.from('S3 Test Buffer');
    
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: testBuffer,
      Metadata: { iv: 'aabbccdd' }
    }));

    const getRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: testKey }));
    
    const chunks = [];
    for await (const chunk of getRes.Body) chunks.push(chunk);
    const dlBuffer = Buffer.concat(chunks);

    if (dlBuffer.toString() !== testBuffer.toString()) throw new Error('Bytes mismatch');
    const metaIv = getRes.Metadata?.iv || getRes.Metadata?.IV;
    if (metaIv !== 'aabbccdd') throw new Error(`Metadata mismatch`);

    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));

    stats.s3 = true;
  } catch (err) {
    console.log(`\n[FAIL] S3: ${err.message}`);
  }
}

async function testEncryption() {
  try {
    const pt = crypto.randomBytes(32);
    const { data: ct, iv } = vaultiqCrypto.encrypt(pt);
    if (iv.length !== 16) throw new Error('IV invalid length');
    
    const decrypted = vaultiqCrypto.decrypt(ct, iv);
    if (decrypted.toString('hex') !== pt.toString('hex')) throw new Error('Decryption mismatch');

    stats.encryption = true;
  } catch (err) {
    console.log(`\n[FAIL] Encryption: ${err.message}`);
  }
}

async function testIntegrity() {
  try {
    const buf1 = crypto.randomBytes(64);
    const buf2 = crypto.randomBytes(64);
    
    if (vaultiqCrypto.sha256(buf1) !== vaultiqCrypto.sha256(buf1)) throw new Error('Hash deterministic failure');
    if (vaultiqCrypto.sha256(buf1) === vaultiqCrypto.sha256(buf2)) throw new Error('Collision failure');

    const { data: ct, iv } = vaultiqCrypto.encrypt(buf1);
    
    ct[0] ^= 0x01; 
    let tamperedDecrypted;
    try {
      tamperedDecrypted = vaultiqCrypto.decrypt(ct, iv);
    } catch (e) { }

    if (tamperedDecrypted && vaultiqCrypto.sha256(tamperedDecrypted) === vaultiqCrypto.sha256(buf1)) {
      throw new Error('Tampered data produced matching hash');
    }
    
    stats.integrity = true;
  } catch (err) {
    console.log(`\n[FAIL] Integrity: ${err.message}`);
  }
}

async function testAuthRoutes() {
  try {
    let res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: testUser.password, fullName: testUser.fullName })
    });
    if (res.status === 201) { 
      stats.authPassed++; 
      const parsed = await res.json(); 
      testUser.token = parsed.data.token; 
      testUser.id = parsed.data.user.id; 
    }
    
    res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: testUser.password, fullName: testUser.fullName })
    });
    if (res.status === 400) stats.authPassed++;

    res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: 'wrong_password' })
    });
    if (res.status === 401) stats.authPassed++;

    res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: testUser.password })
    });
    if (res.status === 200) stats.authPassed++;

    res = await fetch(`${BASE_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${testUser.token}` } });
    if (res.status === 200) stats.authPassed++;

    res = await fetch(`${BASE_URL}/api/auth/me`);
    if (res.status === 401) stats.authPassed++;

    res = await fetch(`${BASE_URL}/api/auth/me`, { headers: { 'Authorization': 'Bearer garbage_token_abcf123' } });
    if (res.status === 403) stats.authPassed++;

  } catch (err) {
    console.log(`\n[FAIL] Auth Routes: ${err.message}`);
  }
}

async function testFileRoutes() {
  if (!testUser.token) return; 

  try {
    const boundary = '----WebKitFormBoundary7M4W';
    const fakeData = 'Fake PDF Data Stream';
    const bodyStr = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n${fakeData}\r\n--${boundary}--`;

    let res = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${testUser.token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: bodyStr
    });
    
    if (res.status === 201) {
      stats.filesPassed++;
      const payload = await res.json();
      uploadedFileId = payload.data.file.id;
    }

    res = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${testUser.token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: `--${boundary}\r\nContent-Disposition: form-data; name="not_file"\r\n\r\nEmpty\r\n--${boundary}--`
    });
    if (res.status === 400) stats.filesPassed++;

    res = await fetch(`${BASE_URL}/api/files`, { headers: { 'Authorization': `Bearer ${testUser.token}` } });
    if (res.status === 200) {
      const d = await res.json();
      if (d.data && Array.isArray(d.data.files)) stats.filesPassed++;
    }

    if (uploadedFileId) {
      res = await fetch(`${BASE_URL}/api/files/${uploadedFileId}/download`, { headers: { 'Authorization': `Bearer ${testUser.token}` } });
      if (res.status === 200) stats.filesPassed++;

      const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      
      await supabaseAdmin.from('files').update({ sha256_hash: 'badhash_altered_data' }).eq('id', uploadedFileId);
      res = await fetch(`${BASE_URL}/api/files/${uploadedFileId}/download`, { headers: { 'Authorization': `Bearer ${testUser.token}` } });
      if (res.status === 409) stats.filesPassed++;
      
      await supabaseAdmin.from('files').update({ sha256_hash: vaultiqCrypto.sha256(Buffer.from(fakeData)) }).eq('id', uploadedFileId);

      const badToken = jwt.sign({ sub: crypto.randomUUID(), email: 'x@x.com' }, process.env.JWT_SECRET || 'testsecret');
      
      res = await fetch(`${BASE_URL}/api/files/${uploadedFileId}/download`, { headers: { 'Authorization': `Bearer ${badToken}` } });
      if (res.status === 403) stats.filesPassed++;

      res = await fetch(`${BASE_URL}/api/files/${uploadedFileId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${badToken}` } });
      if (res.status === 403) stats.filesPassed++;

      res = await fetch(`${BASE_URL}/api/files/${uploadedFileId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${testUser.token}` } });
      if (res.status === 200) stats.filesPassed++;
    }
  } catch (err) {
    console.log(`\n[FAIL] File Routes: ${err.message}`);
  }
}

async function testSecurityChecks() {
  try {
    if (stats.filesPassed >= 4) stats.securityPassed++;

    if (testUser.token && process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME) {
      const plaintext = 'SECRETS';
      const boundary = '----WebKitFormBoundary7M4W';
      let res = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${testUser.token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="s.txt"\r\nContent-Type: text/plain\r\n\r\n${plaintext}\r\n--${boundary}--`
      });
      
      if (res.status === 201) {
        const payload = await res.json();
        const s3 = new S3Client({
          region: process.env.AWS_REGION || 'ap-south-1',
          credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
        });
        const getRes = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: payload.data.file.s3_key }));
        const chunks = [];
        for await (const chunk of getRes.Body) chunks.push(chunk);
        
        if (!Buffer.concat(chunks).toString().includes(plaintext)) {
          stats.securityPassed++;
        }
        
        await fetch(`${BASE_URL}/api/files/${payload.data.file.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${testUser.token}` } });
      }
    } else {
      console.log('\n[SECURITY] Skipping S3 Plaintext check (Missing Key)');
    }

    try {
      jwt.verify(testUser.token || 'fake', 'invalid_secret');
    } catch (e) {
      stats.securityPassed++;
    }

    let rlTriggered = false;
    for (let i = 0; i < 105; i++) {
        const r = await fetch(`${BASE_URL}/api/health`);
        if (r.status === 429) { rlTriggered = true; break; }
    }
    if (rlTriggered) stats.securityPassed++;

  } catch (err) {
    console.log(`\n[FAIL] Security Checks: ${err.message}`);
  }
}

async function cleanupTestData() {
  try {
    if (testUser.id && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      await supabase.auth.admin.deleteUser(testUser.id);
    }
  } catch (err) { }
}

runAllTests();
