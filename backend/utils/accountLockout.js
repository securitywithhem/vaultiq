/**
 * @file accountLockout.js
 * @description Account lockout and login attempt tracking
 * @dependencies supabase
 * @exports isAccountLocked, recordFailedLogin, clearFailedLogins
 */

const { supabaseAdmin } = require('./supabase');
const { sendSecurityAlert } = require('./emailService');

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

async function isAccountLocked(userId) {
  try {
    const { data } = await supabaseAdmin
      .from('login_attempts')
      .select('attempts, last_attempt_at')
      .eq('user_id', userId)
      .single();

    if (!data) return false;

    const lastAttempt = new Date(data.last_attempt_at);
    const now = new Date();
    const minutesElapsed = (now - lastAttempt) / (1000 * 60);

    // If lockout duration has expired, reset attempts
    if (minutesElapsed > LOCKOUT_DURATION_MINUTES) {
      await clearFailedLogins(userId);
      return false;
    }

    return data.attempts >= MAX_LOGIN_ATTEMPTS;
  } catch (err) {
    console.error('[accountLockout.isAccountLocked]', err.message);
    return true; // Fix 10: fail closed — deny login if lockout state is unknown
  }
}

async function recordFailedLogin(userId, userEmail) {
  try {
    const { data: existingAttempt } = await supabaseAdmin
      .from('login_attempts')
      .select('attempts, last_attempt_at')
      .eq('user_id', userId)
      .single();

    let attempts = 1;
    if (existingAttempt) {
      const lastAttempt = new Date(existingAttempt.last_attempt_at);
      const now = new Date();
      const minutesElapsed = (now - lastAttempt) / (1000 * 60);

      // Reset counter if more than lockout duration has passed
      attempts = minutesElapsed > LOCKOUT_DURATION_MINUTES 
        ? 1 
        : existingAttempt.attempts + 1;
    }

    // Upsert login attempts record
    await supabaseAdmin
      .from('login_attempts')
      .upsert({
        user_id: userId,
        attempts: attempts,
        last_attempt_at: new Date()
      }, {
        onConflict: 'user_id'
      });

    // If max attempts reached, send security alert
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      await sendSecurityAlert(
        userEmail,
        `Too many failed login attempts. Your account has been temporarily locked for ${LOCKOUT_DURATION_MINUTES} minutes.`
      );
    }

    console.log(`[accountLockout] Recorded failed login attempt for user ${userId} (attempt ${attempts}/${MAX_LOGIN_ATTEMPTS})`);
  } catch (err) {
    console.error('[accountLockout.recordFailedLogin]', err.message);
  }
}

async function clearFailedLogins(userId) {
  try {
    await supabaseAdmin
      .from('login_attempts')
      .update({ attempts: 0, last_attempt_at: new Date() })
      .eq('user_id', userId);

    console.log(`[accountLockout] Cleared failed login attempts for user ${userId}`);
  } catch (err) {
    console.error('[accountLockout.clearFailedLogins]', err.message);
  }
}

module.exports = {
  isAccountLocked,
  recordFailedLogin,
  clearFailedLogins,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES
};
