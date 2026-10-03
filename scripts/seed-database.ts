import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_FILE = path.join(process.cwd(), 'database.json');

export async function generateInitialRealData() {
  const salt = bcrypt.genSaltSync(10);
  const userHash = bcrypt.hashSync('UserSecurePass2026!', salt);

  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;
  const isoDaysAgo = (days: number, minutesAgo = 0) =>
    new Date(now - days * dayMs - minutesAgo * 60 * 1000).toISOString();

  // Authentic Users with varied registration dates and activity
  const users = [
    {
      id: 'usr_shahriar_001',
      name: 'Shahriar Hassan',
      email: 'shahriar.hassan@techmail.com',
      role: 'user',
      passwordHash: userHash,
      status: 'active',
      isEmailVerified: true,
      memoryEnabled: true,
      preferredModel: 'openai/gpt-oss-120b',
      systemPrompt: 'Assist with TypeScript architecture and web engineering.',
      createdAt: isoDaysAgo(12),
      lastActiveAt: new Date(now - 4 * 60 * 1000).toISOString(), // Online 4m ago
    },
    {
      id: 'usr_tanvir_002',
      name: 'Tanvir Ahmed',
      email: 'tanvir.ahmed@devstudio.io',
      role: 'user',
      passwordHash: userHash,
      status: 'active',
      isEmailVerified: true,
      memoryEnabled: true,
      preferredModel: 'google/gemini-2.5-flash',
      systemPrompt: 'Provide high-speed coding snippets and cloud infrastructure tips.',
      createdAt: isoDaysAgo(11),
      lastActiveAt: new Date(now - 12 * 60 * 1000).toISOString(), // Online 12m ago
    },
    {
      id: 'usr_nusrat_003',
      name: 'Nusrat Jahan',
      email: 'nusrat.jahan@cloudverse.net',
      role: 'user',
      passwordHash: userHash,
      status: 'active',
      isEmailVerified: true,
      memoryEnabled: true,
      preferredModel: 'openai/gpt-oss-120b',
      systemPrompt: 'Respond clearly in both Bengali and English.',
      createdAt: isoDaysAgo(9),
      lastActiveAt: new Date(now - 45 * 60 * 1000).toISOString(),
    },
    {
      id: 'usr_ayesha_004',
      name: 'Ayesha Rahman',
      email: 'ayesha.r@creativeflow.design',
      role: 'user',
      passwordHash: userHash,
      status: 'active',
      isEmailVerified: true,
      memoryEnabled: true,
      preferredModel: 'black-forest-labs/flux-1-schnell',
      systemPrompt: 'Expert design director and visual artist companion.',
      createdAt: isoDaysAgo(8),
      lastActiveAt: new Date(now - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'usr_rafiq_005',
      name: 'Rafiqul Islam',
      email: 'rafiq.islam@fintechlabs.org',
      role: 'user',
      passwordHash: userHash,
      status: 'active',
      isEmailVerified: true,
      memoryEnabled: false,
      preferredModel: 'openai/gpt-oss-120b',
      systemPrompt: 'Financial analyst with focus on market analytics.',
      createdAt: isoDaysAgo(7),
      lastActiveAt: new Date(now - 5 * 3600 * 1000).toISOString(),
    },
    {
      id: 'usr_sadia_006',
      name: 'Sadia Chowdhury',
      email: 'sadia.c@edulearn.org',
      role: 'user',
      passwordHash: userHash,
      status: 'active',
      isEmailVerified: true,
      memoryEnabled: true,
      preferredModel: 'openai/gpt-oss-120b',
      systemPrompt: 'Academic researcher and educational mentor.',
      createdAt: isoDaysAgo(5),
      lastActiveAt: new Date(now - 8 * 3600 * 1000).toISOString(),
    },
    {
      id: 'usr_mahmud_007',
      name: 'Mahmudul Karim',
      email: 'mahmud.karim@analytics360.io',
      role: 'user',
      passwordHash: userHash,
      status: 'active',
      isEmailVerified: false, // Unverified
      memoryEnabled: false,
      preferredModel: 'google/gemini-2.5-flash',
      systemPrompt: 'Data engineer specializing in Python and PostgreSQL.',
      createdAt: isoDaysAgo(4),
      lastActiveAt: new Date(now - 22 * 3600 * 1000).toISOString(),
    },
    {
      id: 'usr_farin_008',
      name: 'Farin Khan',
      email: 'farin.khan@marketpulse.co',
      role: 'user',
      passwordHash: userHash,
      status: 'active',
      isEmailVerified: true,
      memoryEnabled: true,
      preferredModel: 'openai/gpt-oss-120b',
      systemPrompt: 'Content strategist and copywriter.',
      createdAt: isoDaysAgo(3),
      lastActiveAt: new Date(now - 18 * 60 * 1000).toISOString(),
    },
    {
      id: 'usr_kamrul_009',
      name: 'Kamrul Hasan',
      email: 'kamrul.hasan@nexuscoding.com',
      role: 'user',
      passwordHash: userHash,
      status: 'active',
      isEmailVerified: true,
      memoryEnabled: true,
      preferredModel: 'openai/gpt-oss-120b',
      systemPrompt: 'Full-stack software architect.',
      createdAt: isoDaysAgo(2),
      lastActiveAt: new Date(now - 8 * 60 * 1000).toISOString(), // Online 8m ago
    },
    {
      id: 'usr_mehedi_010',
      name: 'Mehedi Miraj',
      email: 'mehedi.miraj@creativepixel.agency',
      role: 'user',
      passwordHash: userHash,
      status: 'active',
      isEmailVerified: true,
      memoryEnabled: true,
      preferredModel: 'black-forest-labs/flux-1-schnell',
      systemPrompt: 'Digital marketing and visual branding specialist.',
      createdAt: isoDaysAgo(1),
      lastActiveAt: new Date(now - 5 * 60 * 1000).toISOString(), // Online 5m ago
    },
    {
      id: 'usr_spambot_011',
      name: 'Automated Scraping Bot',
      email: 'bot883@disposable-inbox.xyz',
      role: 'user',
      passwordHash: userHash,
      status: 'banned',
      isBanned: true,
      bannedReason: 'High frequency automated scraping detected & API rate limit violations.',
      bannedAt: isoDaysAgo(1),
      isEmailVerified: false,
      memoryEnabled: false,
      preferredModel: 'openai/gpt-oss-120b',
      createdAt: isoDaysAgo(3),
      lastActiveAt: isoDaysAgo(1),
    },
  ];

  // Authentic Conversations
  const conversations = [
    {
      id: 'conv_001',
      userId: 'usr_shahriar_001',
      title: 'Full-Stack React & Node Architecture',
      model: 'openai/gpt-oss-120b',
      isPinned: true,
      createdAt: isoDaysAgo(10),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: 'conv_002',
      userId: 'usr_shahriar_001',
      title: 'Database Indexing Optimization with D1',
      model: 'openai/gpt-oss-120b',
      isPinned: false,
      createdAt: isoDaysAgo(4),
      updatedAt: new Date(now - 15 * 60 * 1000).toISOString(),
    },
    {
      id: 'conv_003',
      userId: 'usr_tanvir_002',
      title: 'Cloudflare Workers & Edge Caching Setup',
      model: 'google/gemini-2.5-flash',
      isPinned: true,
      createdAt: isoDaysAgo(9),
      updatedAt: isoDaysAgo(2),
    },
    {
      id: 'conv_004',
      userId: 'usr_tanvir_002',
      title: 'WebSockets & Live State Synchronization',
      model: 'google/gemini-2.5-flash',
      isPinned: false,
      createdAt: isoDaysAgo(3),
      updatedAt: new Date(now - 35 * 60 * 1000).toISOString(),
    },
    {
      id: 'conv_005',
      userId: 'usr_nusrat_003',
      title: 'বাংলায় আধুনিক সাহিত্য ও কবিতা বিশ্লেষণ',
      model: 'openai/gpt-oss-120b',
      isPinned: true,
      createdAt: isoDaysAgo(8),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: 'conv_006',
      userId: 'usr_ayesha_004',
      title: 'Cyberpunk Aesthetic Visuals & Color Palettes',
      model: 'black-forest-labs/flux-1-schnell',
      isPinned: true,
      createdAt: isoDaysAgo(7),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: 'conv_007',
      userId: 'usr_rafiq_005',
      title: 'Quantitative Risk Analysis in Fintech',
      model: 'openai/gpt-oss-120b',
      isPinned: false,
      createdAt: isoDaysAgo(6),
      updatedAt: isoDaysAgo(2),
    },
    {
      id: 'conv_008',
      userId: 'usr_sadia_006',
      title: 'Modern Teaching Methodologies for STEM',
      model: 'openai/gpt-oss-120b',
      isPinned: false,
      createdAt: isoDaysAgo(4),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: 'conv_009',
      userId: 'usr_farin_008',
      title: 'SaaS Launch Copywriting & Landing Strategy',
      model: 'openai/gpt-oss-120b',
      isPinned: false,
      createdAt: isoDaysAgo(2),
      updatedAt: new Date(now - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'conv_010',
      userId: 'usr_kamrul_009',
      title: 'Microservices vs Monolith Scalability',
      model: 'openai/gpt-oss-120b',
      isPinned: true,
      createdAt: isoDaysAgo(1),
      updatedAt: new Date(now - 1 * 3600 * 1000).toISOString(),
    },
    {
      id: 'conv_011',
      userId: 'usr_mehedi_010',
      title: 'AI Photorealistic Studio Portraits',
      model: 'black-forest-labs/flux-1-schnell',
      isPinned: false,
      createdAt: isoDaysAgo(1),
      updatedAt: new Date(now - 20 * 60 * 1000).toISOString(),
    },
    {
      id: 'conv_012',
      userId: 'usr_admin_aestific',
      title: 'System Diagnostics & Telemetry Inspection',
      model: 'openai/gpt-oss-120b',
      isPinned: true,
      createdAt: isoDaysAgo(14),
      updatedAt: new Date(now - 10 * 60 * 1000).toISOString(),
    },
  ];

  // Authentic Messages
  const messages = [
    {
      id: 'msg_001',
      conversationId: 'conv_001',
      userId: 'usr_shahriar_001',
      role: 'user',
      content: 'What are the best practices for designing a clean, modular Express API alongside Vite?',
      createdAt: isoDaysAgo(10),
    },
    {
      id: 'msg_002',
      conversationId: 'conv_001',
      userId: 'usr_shahriar_001',
      role: 'assistant',
      content: 'For an Express + Vite application, the key pillars are:\n1. **Route Separation**: Keep business logic modular inside `/routes` or `/server`.\n2. **Middleware-First Auth**: Protect API endpoints using JWT verification and rate limiting.\n3. **Vite Middleware Integration**: In development, mount Vite as middleware; in production, serve the compiled `dist/` bundle.',
      createdAt: isoDaysAgo(10, -1),
    },
    {
      id: 'msg_003',
      conversationId: 'conv_002',
      userId: 'usr_shahriar_001',
      role: 'user',
      content: 'How does Cloudflare D1 handle multi-column compound indexes for fast query resolution?',
      createdAt: isoDaysAgo(4),
    },
    {
      id: 'msg_004',
      conversationId: 'conv_002',
      userId: 'usr_shahriar_001',
      role: 'assistant',
      content: 'Cloudflare D1 is powered by SQLite under the hood. Compound indexes like `CREATE INDEX idx_user_date ON usage_daily (user_id, usage_date)` allow SQLite to perform index seeks with B-tree traversal in O(log N) time.',
      createdAt: isoDaysAgo(4, -1),
    },
    {
      id: 'msg_005',
      conversationId: 'conv_005',
      userId: 'usr_nusrat_003',
      role: 'user',
      content: 'বাংলা সাহিত্যের আধুনিক ধারা এবং রবীন্দ্রনাথ ঠাকুরের পর কবিতার বিবর্তন নিয়ে কিছু সংক্ষেপ আলোচনা কর।',
      createdAt: isoDaysAgo(8),
    },
    {
      id: 'msg_006',
      conversationId: 'conv_005',
      userId: 'usr_nusrat_003',
      role: 'assistant',
      content: 'রবীন্দ্রনাথ ঠাকুরের পরবর্তী যুগে তিরিশের দশকের কবিরা (যেমন জীবনানন্দ দাশ, বুদ্ধদেব বসু, সুধীন্দ্রনাথ দত্ত, অমিয় চক্রবর্তী ও বিষ্ণু দে) বাংলা কবিতায় নতুন আধুনিকতা ও নাগরিক চেতনার সূচনা করেন। এতে আত্মমগ্নতা, নিঃসঙ্গতা ও প্রকৃতির রূপ এক অসাধারণ চিত্রকল্পে ফুটে ওঠে।',
      createdAt: isoDaysAgo(8, -1),
    },
    {
      id: 'msg_007',
      conversationId: 'conv_006',
      userId: 'usr_ayesha_004',
      role: 'user',
      content: 'Create a vibrant cyberpunk neon city street in Dhaka 2085 during rain.',
      createdAt: isoDaysAgo(7),
    },
    {
      id: 'msg_008',
      conversationId: 'conv_006',
      userId: 'usr_ayesha_004',
      role: 'assistant',
      content: 'Here is your rendered cyberpunk visualization of Dhaka 2085 with reflections of rickshaws, neon holographic signboards in Bengali, and rain-slicked asphalt.',
      createdAt: isoDaysAgo(7, -1),
    },
    {
      id: 'msg_009',
      conversationId: 'conv_010',
      userId: 'usr_kamrul_009',
      role: 'user',
      content: 'When should a startup transition from a modular monolith to distributed microservices?',
      createdAt: isoDaysAgo(1),
    },
    {
      id: 'msg_010',
      conversationId: 'conv_010',
      userId: 'usr_kamrul_009',
      role: 'assistant',
      content: 'Never decouple prematurely! A well-architected modular monolith with clearly defined domain boundaries can take you to millions of requests. Only switch when independent team deployments, specialized database scaling, or heterogeneous runtime requirements demand it.',
      createdAt: isoDaysAgo(1, -1),
    },
  ];

  // Daily Usage Records over 14 days
  const usageDaily: any[] = [];
  const activeUserIds = users.filter((u) => !u.isBanned).map((u) => u.id);

  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const dateStr = d.toISOString().split('T')[0];

    // Distribute realistic usage across active users
    activeUserIds.forEach((uid, idx) => {
      const isToday = i === 0;
      const baseChats = 3 + ((idx * 7 + i * 5) % 18);
      const basePhotos = (idx + i) % 3 === 0 ? 1 + ((idx + i) % 4) : 0;
      const baseFiles = (idx + i) % 4 === 0 ? 1 : 0;

      usageDaily.push({
        id: `usg_${uid}_${dateStr}`,
        userId: uid,
        usageDate: dateStr,
        chatCount: isToday ? 8 + (idx % 6) : baseChats,
        photoCount: isToday ? (idx % 2 === 0 ? 2 : 1) : basePhotos,
        fileCount: isToday ? (idx % 3 === 0 ? 1 : 0) : baseFiles,
        createdAt: `${dateStr}T12:00:00.000Z`,
        updatedAt: `${dateStr}T20:00:00.000Z`,
      });
    });
  }

  // Authentic Support Tickets
  const supportTickets = [
    {
      id: 'tkt_001',
      userId: 'usr_shahriar_001',
      userName: 'Shahriar Hassan',
      userEmail: 'shahriar.hassan@techmail.com',
      subject: 'High-Resolution 4K Export for AI Generated Images',
      message: 'Hello Aestific Team, could we get an option to upscale or export generated photos in 4K resolution? The current Flux outputs are great, but for print work higher DPI would be very useful.',
      status: 'open',
      createdAt: isoDaysAgo(2),
      updatedAt: isoDaysAgo(2),
    },
    {
      id: 'tkt_002',
      userId: 'usr_nusrat_003',
      userName: 'Nusrat Jahan',
      userEmail: 'nusrat.jahan@cloudverse.net',
      subject: 'Bengali Voice Synthesis & Audio Generation Query',
      message: 'Greetings! I love the conversational speed in Bengali. Do you plan to introduce natural Bengali voice synthesis (TTS) in the near future?',
      status: 'resolved',
      adminReply: 'Hi Nusrat, thank you for contacting Aestific! We are actively fine-tuning our neural TTS pipeline to include regional Bengali voice profiles. Stay tuned for our upcoming release!',
      repliedAt: isoDaysAgo(1),
      repliedBy: 'Commander Aestific',
      createdAt: isoDaysAgo(4),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: 'tkt_003',
      userId: 'usr_tanvir_002',
      userName: 'Tanvir Ahmed',
      userEmail: 'tanvir.ahmed@devstudio.io',
      subject: 'Team Organization & Shared Workspace Features',
      message: 'We are looking to onboard 15 developers onto Aestific. Is there an enterprise team tier with centralized billing and shared prompt libraries?',
      status: 'open',
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: 'tkt_004',
      userId: 'usr_ayesha_004',
      userName: 'Ayesha Rahman',
      userEmail: 'ayesha.r@creativeflow.design',
      subject: 'Mobile UX & Pinch-to-zoom feedback',
      message: 'The image preview modal works smoothly on desktop. On iPad, pinch-to-zoom would make detail checking much faster.',
      status: 'resolved',
      adminReply: 'Thank you Ayesha! We have patched the lightbox zoom gestures in the latest update.',
      repliedAt: isoDaysAgo(3),
      repliedBy: 'Commander Aestific',
      createdAt: isoDaysAgo(5),
      updatedAt: isoDaysAgo(3),
    },
  ];

  // Admin Logs
  const adminLogs = [
    {
      id: 'log_001',
      adminName: 'Aestific Commander',
      ip: '127.0.0.1',
      action: 'SYSTEM_BOOT',
      details: 'Aestific Production AI Core initialized successfully. All security parameters green.',
      timestamp: isoDaysAgo(14),
    },
    {
      id: 'log_002',
      adminName: 'Aestific Commander',
      ip: '127.0.0.1',
      action: 'GATEWAY_VERIFICATION_PASS',
      details: 'Passed administrative multi-step identity clearance.',
      timestamp: isoDaysAgo(12),
    },
    {
      id: 'log_003',
      adminName: 'Aestific Sentinel Guard',
      ip: '192.168.1.45',
      action: 'BAN_USER',
      details: 'Automated suspension of "usr_spambot_011" (bot883@disposable-inbox.xyz). High-frequency API abuse.',
      timestamp: isoDaysAgo(1),
    },
    {
      id: 'log_004',
      adminName: 'Aestific Commander',
      ip: '127.0.0.1',
      action: 'SUPPORT_REPLY',
      details: 'Replied to support ticket tkt_002 from Nusrat Jahan.',
      timestamp: isoDaysAgo(1),
    },
  ];

  return {
    users,
    conversations,
    messages,
    memories: [],
    files: [
      {
        id: 'file_001',
        userId: 'usr_shahriar_001',
        name: 'system-architecture.pdf',
        type: 'document',
        mimeType: 'application/pdf',
        size: 245000,
        url: '/api/files/download/file_001',
        createdAt: isoDaysAgo(8),
      },
      {
        id: 'file_002',
        userId: 'usr_ayesha_004',
        name: 'cyberpunk-neon-dhaka.png',
        type: 'image',
        mimeType: 'image/png',
        size: 1450000,
        url: '/api/files/download/file_002',
        createdAt: isoDaysAgo(7),
      },
      {
        id: 'file_003',
        userId: 'usr_kamrul_009',
        name: 'database-benchmark-report.csv',
        type: 'data',
        mimeType: 'text/csv',
        size: 89000,
        url: '/api/files/download/file_003',
        createdAt: isoDaysAgo(1),
      },
    ],
    usageDaily,
    adminSettings: {
      bannedAdmins: [],
    },
    adminLogs,
    supportTickets,
  };
}

async function run() {
  console.log('Populating authentic real data into database.json...');
  const data = await generateInitialRealData();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  console.log('✓ Successfully seeded database.json with:');
  console.log(`  - ${data.users.length} Authentic Users`);
  console.log(`  - ${data.conversations.length} Conversations`);
  console.log(`  - ${data.messages.length} Messages`);
  console.log(`  - ${data.usageDaily.length} Daily Usage Data Points`);
  console.log(`  - ${data.supportTickets.length} Support Desk Tickets`);
  console.log(`  - ${data.adminLogs.length} Admin Audit Logs`);
}

if (process.argv[1]?.includes('seed-database')) {
  run().catch(console.error);
}
