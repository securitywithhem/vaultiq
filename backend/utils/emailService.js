/**
 * @file emailService.js
 * @description Email sending service for verification, password reset, etc.
 * @dependencies nodemailer
 * @exports sendVerificationEmail, sendPasswordResetEmail
 */

const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendVerificationEmail(email, verificationToken) {
  try {
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@vaultiq.com',
      to: email,
      subject: 'VaultIQ - Verify Your Email Address',
      html: `
        <html>
          <body style="font-family: Arial, sans-serif;">
            <h2>Welcome to VaultIQ!</h2>
            <p>Click the link below to verify your email address:</p>
            <a href="${verificationLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email
            </a>
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This link expires in 24 hours.<br>
              If you didn't create this account, please ignore this email.
            </p>
          </body>
        </html>
      `,
      text: `Verify your email at: ${verificationLink}\n\nThis link expires in 24 hours.`
    });

    console.log(`[emailService] Verification email sent to ${email}`);
  } catch (err) {
    console.error('[emailService.sendVerificationEmail]', err.message);
    throw new Error('Failed to send verification email', { cause: err });
  }
}

async function sendSecurityAlert(email, reason) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@vaultiq.com',
      to: email,
      subject: 'VaultIQ - Security Alert',
      html: `
        <html>
          <body style="font-family: Arial, sans-serif;">
            <h2>Security Alert</h2>
            <p>We detected suspicious activity on your VaultIQ account:</p>
            <p><strong>${reason}</strong></p>
            <p>If this wasn't you, please secure your account immediately by changing your password.</p>
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              If you need help, contact our support team.
            </p>
          </body>
        </html>
      `,
      text: `Security Alert: ${reason}\n\nIf this wasn't you, please change your password immediately.`
    });

    console.log(`[emailService] Security alert sent to ${email}`);
  } catch (err) {
    console.error('[emailService.sendSecurityAlert]', err.message);
    // Don't throw - alert failures shouldn't crash the app
  }
}

module.exports = {
  sendVerificationEmail,
  sendSecurityAlert
};
