// ==========================================
// BREVO EMAIL VERIFICATION ENGINE (Aestific Core)
// ==========================================

import { redactSensitiveData } from './error-handler.js';

interface BrevoSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isAuthError?: boolean;
}

// Track if current Brevo API Key failed authentication (e.g. HTTP 401 Key not found)
let lastFailedApiKey: string | null = null;

export function isBrevoConfigured(): boolean {
  const apiKey = (process.env.BREVO_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || '').trim().replace(/^['"]|['"]$/g, '');
  
  if (!apiKey || (lastFailedApiKey && lastFailedApiKey === apiKey)) {
    return false;
  }

  return Boolean(
    apiKey.startsWith('xkeysib-') &&
    apiKey.length > 25 &&
    senderEmail &&
    senderEmail.includes('@') &&
    !senderEmail.startsWith('MY_')
  );
}

export function getBrevoSenderConfig(): { name: string; email: string } {
  const name = (process.env.BREVO_SENDER_NAME || 'Aestific Official').trim().replace(/^['"]|['"]$/g, '');
  const email = (process.env.BREVO_SENDER_EMAIL || '').trim().replace(/^['"]|['"]$/g, '');
  return { name, email };
}

/**
 * Sends a secure 6-digit verification code email via Brevo REST API
 * Security: Never logs API keys, verification codes, or passwords
 */
export async function sendVerificationEmail(
  toEmail: string,
  userName: string,
  verificationCode: string
): Promise<BrevoSendResult> {
  const apiKey = (process.env.BREVO_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  const { name: senderName, email: senderEmail } = getBrevoSenderConfig();

  if (!isBrevoConfigured()) {
    return {
      success: false,
      error: 'Brevo email service is not configured (missing or invalid BREVO_API_KEY in Settings).',
      isAuthError: true,
    };
  }

  const safeUserName = userName ? userName.trim() : 'Aestific Member';
  const recipientEmail = toEmail.trim().toLowerCase();

  // Premium, anti-slop HTML template matching Aestific's clean dark monochrome aesthetic
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your Aestific account</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #07070d;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e4e4e7;
    }
    .wrapper {
      width: 100%;
      background-color: #07070d;
      padding: 40px 15px;
      box-sizing: border-box;
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
      background-color: #0d0d16;
      border: 1px solid #27273a;
      border-radius: 20px;
      padding: 40px 32px;
      box-sizing: border-box;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    }
    .logo-container {
      text-align: center;
      margin-bottom: 28px;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 2px;
      margin: 0;
      background: linear-gradient(135deg, #ff2e93 0%, #a855f7 50%, #00f0ff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-transform: uppercase;
    }
    .tagline {
      font-size: 11px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-top: 4px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #f4f4f5;
      margin-bottom: 12px;
    }
    .body-text {
      font-size: 14px;
      line-height: 1.6;
      color: #a1a1aa;
      margin-bottom: 24px;
    }
    .code-box {
      background-color: #040408;
      border: 1px solid #3b1d4d;
      border-radius: 14px;
      padding: 20px;
      text-align: center;
      margin: 28px 0;
    }
    .code-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #ec4899;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .code-value {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 8px;
      color: #ffffff;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      margin: 0;
    }
    .expiration-badge {
      display: inline-block;
      margin-top: 10px;
      font-size: 12px;
      color: #fbbf24;
      background-color: rgba(251, 191, 36, 0.1);
      border: 1px solid rgba(251, 191, 36, 0.25);
      border-radius: 20px;
      padding: 4px 12px;
    }
    .security-notice {
      border-top: 1px solid #1f1f2e;
      padding-top: 20px;
      margin-top: 28px;
      font-size: 12px;
      color: #71717a;
      line-height: 1.5;
    }
    .footer {
      text-align: center;
      font-size: 11px;
      color: #52525b;
      margin-top: 28px;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo-container">
        <h1 class="brand-title">AESTIFIC</h1>
        <div class="tagline">Inventing What's Next</div>
      </div>

      <div class="greeting">Hello ${safeUserName},</div>
      <div class="body-text">
        Welcome to Aestific. Please use the 6-digit verification code below to confirm your email address and activate your account.
      </div>

      <div class="code-box">
        <div class="code-label">Verification Code</div>
        <div class="code-value">${verificationCode}</div>
        <div class="expiration-badge">⏱ Expires in 10 minutes</div>
      </div>

      <div class="body-text" style="font-size: 13px; margin-bottom: 0;">
        Enter this code into the Aestific verification prompt to complete your registration.
      </div>

      <div class="security-notice">
        <strong>Security Notice:</strong> If you did not create an Aestific account or request this code, please disregard this email. Never share your verification code with anyone. Aestific staff will never ask for your verification code.
      </div>
    </div>

    <div class="footer">
      &copy; ${new Date().getFullYear()} Aestific Core Inc. All rights reserved.
    </div>
  </div>
</body>
</html>
  `.trim();

  const textContent = `
AESTIFIC - INVENTING WHAT'S NEXT
========================================

Hello ${safeUserName},

Welcome to Aestific. Please use the following verification code to confirm your email address:

Verification Code: ${verificationCode}
(Expires in 10 minutes)

Security Notice: If you did not create an Aestific account, please ignore this email. Never share this code with anyone.

---
© ${new Date().getFullYear()} Aestific Core Inc.
  `.trim();

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      {
        email: recipientEmail,
        name: safeUserName,
      },
    ],
    subject: 'Verify your Aestific account',
    htmlContent,
    textContent,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const statusCode = response.status;
      const rawMsg = redactSensitiveData(String(errorData?.message || errorData?.code || 'Brevo API rejected request'));

      if (statusCode === 401 || statusCode === 403 || String(rawMsg).toLowerCase().includes('key not found')) {
        lastFailedApiKey = apiKey;
        return {
          success: false,
          error: 'Brevo authentication failed (HTTP 401: Key not found). Please verify your BREVO_API_KEY in Settings.',
          isAuthError: true,
        };
      }
      if (statusCode === 400 && String(rawMsg).toLowerCase().includes('sender')) {
        return {
          success: false,
          error: `Sender email (${senderEmail}) is not verified in Brevo. Please verify your sender domain or email in Brevo dashboard.`,
          isAuthError: false,
        };
      }
      if (statusCode === 429) {
        return {
          success: false,
          error: 'Brevo email rate limit reached. Please wait a moment before requesting another code.',
          isAuthError: false,
        };
      }
      return {
        success: false,
        error: `Brevo email error (${statusCode}): ${rawMsg}. Please check your Brevo account settings.`,
        isAuthError: false,
      };
    }

    const data = await response.json().catch(() => ({}));
    return {
      success: true,
      messageId: data?.messageId,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: 'Email delivery timed out. Please try resending the verification code.',
      };
    }
    return {
      success: false,
      error: 'Failed to connect to email verification service. Please try again.',
    };
  }
}

/**
 * Sends a secure password reset code email via Brevo REST API
 * Security: Never emails existing passwords, never logs reset codes
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  userName: string,
  resetCode: string
): Promise<BrevoSendResult> {
  const apiKey = (process.env.BREVO_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  const { name: senderName, email: senderEmail } = getBrevoSenderConfig();

  if (!isBrevoConfigured()) {
    return {
      success: false,
      error: 'Brevo email service is not configured (missing or invalid BREVO_API_KEY in Settings).',
      isAuthError: true,
    };
  }

  const safeUserName = userName ? userName.trim() : 'Aestific Member';
  const recipientEmail = toEmail.trim().toLowerCase();

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your Aestific password</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #07070d;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e4e4e7;
    }
    .wrapper {
      width: 100%;
      background-color: #07070d;
      padding: 40px 15px;
      box-sizing: border-box;
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
      background-color: #0d0d16;
      border: 1px solid #27273a;
      border-radius: 20px;
      padding: 40px 32px;
      box-sizing: border-box;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    }
    .logo-container {
      text-align: center;
      margin-bottom: 28px;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 2px;
      margin: 0;
      background: linear-gradient(135deg, #ff2e93 0%, #a855f7 50%, #00f0ff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-transform: uppercase;
    }
    .tagline {
      font-size: 11px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-top: 4px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #f4f4f5;
      margin-bottom: 12px;
    }
    .body-text {
      font-size: 14px;
      line-height: 1.6;
      color: #a1a1aa;
      margin-bottom: 24px;
    }
    .code-box {
      background-color: #040408;
      border: 1px solid #3b1d4d;
      border-radius: 14px;
      padding: 20px;
      text-align: center;
      margin: 28px 0;
    }
    .code-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #ec4899;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .code-value {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 8px;
      color: #ffffff;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      margin: 0;
    }
    .expiration-badge {
      display: inline-block;
      margin-top: 10px;
      font-size: 12px;
      color: #fbbf24;
      background-color: rgba(251, 191, 36, 0.1);
      border: 1px solid rgba(251, 191, 36, 0.25);
      border-radius: 20px;
      padding: 4px 12px;
    }
    .security-notice {
      border-top: 1px solid #1f1f2e;
      padding-top: 20px;
      margin-top: 28px;
      font-size: 12px;
      color: #71717a;
      line-height: 1.5;
    }
    .footer {
      text-align: center;
      font-size: 11px;
      color: #52525b;
      margin-top: 28px;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo-container">
        <h1 class="brand-title">AESTIFIC</h1>
        <div class="tagline">Inventing What's Next</div>
      </div>

      <div class="greeting">Hello ${safeUserName},</div>
      <div class="body-text">
        We received a request to reset your Aestific account password. Use the secure 6-digit password reset code below to authorize a new password.
      </div>

      <div class="code-box">
        <div class="code-label">Password Reset Code</div>
        <div class="code-value">${resetCode}</div>
        <div class="expiration-badge">⏱ Expires in 15 minutes</div>
      </div>

      <div class="body-text" style="font-size: 13px; margin-bottom: 0;">
        Enter this code in the password reset window along with your new password. This code can only be used once.
      </div>

      <div class="security-notice">
        <strong>Security Notice:</strong> If you did not request a password reset, you can safely ignore this email. Your existing password remains secure. Never share this code with anyone.
      </div>
    </div>

    <div class="footer">
      &copy; ${new Date().getFullYear()} Aestific Core Inc. All rights reserved.
    </div>
  </div>
</body>
</html>
  `.trim();

  const textContent = `
AESTIFIC - INVENTING WHAT'S NEXT
========================================

Hello ${safeUserName},

We received a request to reset your Aestific account password.

Password Reset Code: ${resetCode}
(Expires in 15 minutes)

Enter this code in Aestific to choose a new password.

Security Notice: If you did not request this reset, please disregard this message. Your existing password remains unchanged.

---
© ${new Date().getFullYear()} Aestific Core Inc.
  `.trim();

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      {
        email: recipientEmail,
        name: safeUserName,
      },
    ],
    subject: 'Reset your Aestific password',
    htmlContent,
    textContent,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const statusCode = response.status;
      const rawMsg = redactSensitiveData(String(errorData?.message || errorData?.code || 'Brevo API rejected request'));

      if (statusCode === 401 || statusCode === 403 || String(rawMsg).toLowerCase().includes('key not found')) {
        lastFailedApiKey = apiKey;
        return {
          success: false,
          error: 'Brevo authentication failed (HTTP 401: Key not found). Please ensure BREVO_API_KEY is valid.',
          isAuthError: true,
        };
      }
      if (statusCode === 400 && String(rawMsg).toLowerCase().includes('sender')) {
        return {
          success: false,
          error: `Sender email (${senderEmail}) is not verified in Brevo. Please verify your sender domain or email in Brevo dashboard.`,
          isAuthError: false,
        };
      }
      if (statusCode === 429) {
        return {
          success: false,
          error: 'Brevo email rate limit reached. Please wait a moment before requesting another reset code.',
          isAuthError: false,
        };
      }
      return {
        success: false,
        error: `Brevo email error (${statusCode}): ${rawMsg}. Please check your Brevo account settings.`,
        isAuthError: false,
      };
    }

    const data = await response.json().catch(() => ({}));
    return {
      success: true,
      messageId: data?.messageId,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: 'Email delivery timed out. Please try requesting a password reset again.',
      };
    }
    return {
      success: false,
      error: 'Failed to connect to email service. Please try again.',
    };
  }
}

/**
 * Sends a custom direct email from Admin to any user / email address via Brevo
 * Allows dynamic custom sender display name!
 */
export async function sendAdminDirectEmail(options: {
  toEmail: string;
  toName?: string;
  senderDisplayName?: string;
  subject: string;
  textContent?: string;
  htmlContent?: string;
}): Promise<BrevoSendResult> {
  const apiKeyPort = (process.env.BREVO_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  const { name: defaultSenderName, email: senderEmail } = getBrevoSenderConfig();

  if (!isBrevoConfigured()) {
    return {
      success: false,
      error: 'Brevo email service is not configured (missing or invalid BREVO_API_KEY in environment).',
    };
  }

  if (!senderEmail || !senderEmail.includes('@') || senderEmail.startsWith('MY_')) {
    return {
      success: false,
      error: 'Brevo verified sender email is not configured (missing BREVO_SENDER_EMAIL).',
    };
  }

  const effectiveSenderName = (options.senderDisplayName || defaultSenderName || 'Aestific Support').trim();
  const recipientEmail = options.toEmail.trim().toLowerCase();
  const recipientName = (options.toName || options.toEmail).trim();
  const subject = options.subject.trim();

  // Create clean formatted HTML body if raw text is provided
  const formattedHtml = options.htmlContent || `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #050508; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5; }
    .wrapper { width: 100%; background-color: #050508; padding: 40px 15px; box-sizing: border-box; }
    .container { max-width: 600px; margin: 0 auto; background-color: #0e0e14; border: 1px solid #27273a; border-radius: 16px; padding: 36px 28px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7); }
    .header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #1f1f2e; }
    .sender-tag { font-size: 13px; font-weight: 700; color: #ef4444; letter-spacing: 0.5px; text-transform: uppercase; }
    .subject { font-size: 20px; font-weight: bold; color: #ffffff; margin-top: 8px; }
    .body-content { font-size: 15px; line-height: 1.7; color: #d4d4d8; white-space: pre-wrap; margin-bottom: 30px; }
    .footer { font-size: 12px; color: #71717a; text-align: center; border-top: 1px solid #1f1f2e; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="sender-tag">${effectiveSenderName}</div>
        <div class="subject">${subject}</div>
      </div>
      <div class="body-content">${(options.textContent || '').replace(/\n/g, '<br/>')}</div>
      <div class="footer">
        Sent by <strong>${effectiveSenderName}</strong> • Official Communication
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const payload = {
    sender: {
      name: effectiveSenderName,
      email: senderEmail,
    },
    to: [
      {
        email: recipientEmail,
        name: recipientName,
      },
    ],
    subject,
    htmlContent: formattedHtml,
    ...(options.textContent ? { textContent: options.textContent } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKeyPort,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const statusCode = response.status;
      const rawMsg = redactSensitiveData(String(errorData?.message || errorData?.code || 'Brevo API rejected email dispatch'));

      if (statusCode === 401 || statusCode === 403 || String(rawMsg).toLowerCase().includes('key not found')) {
        lastFailedApiKey = apiKeyPort;
        return {
          success: false,
          error: 'Brevo authentication failed (HTTP 401: Key not found). Please check your BREVO_API_KEY in settings.',
          isAuthError: true,
        };
      }
      if (statusCode === 400 && String(rawMsg).toLowerCase().includes('sender')) {
        return {
          success: false,
          error: `Sender email (${senderEmail}) is not verified in Brevo.`,
          isAuthError: false,
        };
      }
      return {
        success: false,
        error: `Brevo dispatch error (${statusCode}): ${rawMsg}`,
        isAuthError: false,
      };
    }

    const data = await response.json().catch(() => ({}));
    return {
      success: true,
      messageId: data?.messageId,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: 'Email delivery timed out. Please try again.',
      };
    }
    return {
      success: false,
      error: 'Failed to dispatch email via Brevo. Please check service configuration.',
    };
  }
}


