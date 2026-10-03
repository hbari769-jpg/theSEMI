import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createD1HttpClient } from '../server/d1.js';
import { hashPassword } from '../server/auth.js';

dotenv.config();

async function resetAllData() {
  console.log('====================================================');
  console.log(' AESTIFIC: Full Application Clean State Reset Pipeline');
  console.log('====================================================\n');

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  // 1. Reset Cloudflare D1 Database
  if (accountId && databaseId && apiToken) {
    console.log(`📡 Connecting to Cloudflare D1 Database (${databaseId.slice(0, 8)}...)...`);
    const d1 = createD1HttpClient({ accountId, databaseId, apiToken });

    console.log('🧹 Purging messages, conversations, files, daily usage, and tickets from D1...');
    await d1.prepare('DELETE FROM messages').run();
    await d1.prepare('DELETE FROM files').run();
    await d1.prepare('DELETE FROM conversations').run();
    await d1.prepare('DELETE FROM usage_daily').run();
    await d1.prepare('DELETE FROM memories').run();
    await d1.prepare('DELETE FROM support_tickets').run();
    await d1.prepare('DELETE FROM admin_logs').run();
    await d1.prepare('DELETE FROM banned_admins').run();
    await d1.prepare('DELETE FROM system_locks').run();

    console.log('👥 Cleaning test user accounts from D1 while preserving authentic user credentials...');
    // Real emails to preserve
    const realEmails = ['atifwasee1048@gmail.com', 'hbari769@gmail.com', 'rumanaarminlaki@gmail.com'];
    const placeholders = realEmails.map(() => '?').join(', ');
    await d1.prepare(`DELETE FROM users WHERE email NOT IN (${placeholders})`).bind(...realEmails).run();

    // Ensure any stale insecure admin@aestific.local is purged
    await d1.prepare('DELETE FROM users WHERE email = ?').bind('admin@aestific.local').run();

    // Insert clean initial admin log
    await d1.prepare(`
      INSERT INTO admin_logs (id, admin_name, ip, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      'log_system_init_' + Date.now(),
      'System Sentinel',
      '127.0.0.1',
      'SYSTEM_RESET',
      'Application data cleanly initialized to brand-new state per administrator request.',
      new Date().toISOString()
    ).run();

    console.log('✅ Cloudflare D1 reset complete!');
  } else {
    console.log('ℹ️ Cloudflare D1 credentials not found, skipping D1.');
  }

  // 2. Reset Local Fallback database.json
  console.log('📁 Resetting local fallback database.json...');
  const defaultAdminPassHash = await hashPassword('aestific-admin-vault');
  const now = new Date().toISOString();

  // Load existing atifwasee1048 password hash if available from D1 or previous store
  let userPasswordHash = defaultAdminPassHash;
  try {
    if (fs.existsSync(path.resolve('database.json'))) {
      const prev = JSON.parse(fs.readFileSync(path.resolve('database.json'), 'utf8'));
      const found = prev.users?.find((u: any) => u.email === 'atifwasee1048@gmail.com');
      if (found?.passwordHash) {
        userPasswordHash = found.passwordHash;
      }
    }
  } catch {
    // ignore
  }

  const cleanDatabase = {
    users: [
      {
        id: '393ad63d-57c6-43f7-adc1-a1db21fa6ca8',
        name: 'Admin User',
        email: 'atifwasee1048@gmail.com',
        role: 'admin',
        passwordHash: userPasswordHash,
        status: 'active',
        isEmailVerified: true,
        memoryEnabled: true,
        preferredModel: 'openai/gpt-oss-120b',
        systemPrompt: 'You are Aestific, an elite ultra-fast AI intelligence suite.',
        createdAt: now,
        lastActiveAt: now,
      },
      {
        id: '75e82e82-7f02-4a22-9391-a4b856dbe337',
        name: 'wasi',
        email: 'hbari769@gmail.com',
        role: 'user',
        passwordHash: defaultAdminPassHash,
        status: 'active',
        isEmailVerified: true,
        memoryEnabled: true,
        createdAt: now,
        lastActiveAt: now,
      },
    ],
    conversations: [],
    messages: [],
    memories: [],
    files: [],
    usageDaily: [],
    adminSettings: {
      bannedAdmins: [],
    },
    adminLogs: [
      {
        id: 'log_system_init_' + Date.now(),
        adminName: 'System Sentinel',
        ip: '127.0.0.1',
        action: 'SYSTEM_RESET',
        details: 'Application data cleanly initialized to brand-new state per administrator request.',
        timestamp: now,
      },
    ],
    supportTickets: [],
  };

  fs.writeFileSync(path.resolve('database.json'), JSON.stringify(cleanDatabase, null, 2), 'utf8');
  console.log('✅ database.json reset successfully to clean state!\n');

  console.log('🎉 Reset operation complete! Application is now completely fresh.');
}

resetAllData().catch((err) => {
  console.error('❌ Reset failed:', err);
  process.exit(1);
});
