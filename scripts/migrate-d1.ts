import dotenv from 'dotenv';
import { d1Db, createD1HttpClient } from '../server/db.js';

dotenv.config();

async function runMigration() {
  console.log('========================================================');
  console.log(' AESTIFIC: Cloudflare D1 Database Migration Pipeline');
  console.log('========================================================\n');

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !apiToken) {
    console.error('❌ Missing Cloudflare D1 environment variables in .env:');
    console.error('   - CLOUDFLARE_ACCOUNT_ID');
    console.error('   - CLOUDFLARE_D1_DATABASE_ID');
    console.error('   - CLOUDFLARE_API_TOKEN\n');
    console.log('Please provide these environment variables in your .env file or deployment environment and run again.');
    process.exit(1);
  }

  try {
    console.log(`📡 Connecting to Cloudflare D1 Database ID: ${databaseId}...`);
    const d1 = createD1HttpClient({ accountId, databaseId, apiToken });

    console.log('🚀 Initializing schema and migrating local data...');
    const result = await d1Db.migrateFromJson(d1);

    console.log('\n✅ Migration completed successfully!');
    console.log('📊 Migration Summary:');
    console.log(`   - Users migrated:          ${result.usersMigrated}`);
    console.log(`   - Conversations migrated:  ${result.conversationsMigrated}`);
    console.log(`   - Messages migrated:       ${result.messagesMigrated}`);
    console.log(`   - Account memories:        ${result.memoriesMigrated}`);
    console.log(`   - Files metadata:          ${result.filesMigrated}`);
    console.log(`   - Daily usage logs:        ${result.usageMigrated}`);
    console.log(`   - Support tickets:         ${result.ticketsMigrated}`);
    console.log(`   - Admin audit logs:        ${result.logsMigrated}\n`);
    console.log('All local records have been preserved and safely populated into Cloudflare D1 without data loss.');
  } catch (err: any) {
    console.error('\n❌ Migration failed:', err?.message || err);
    process.exit(1);
  }
}

runMigration();
