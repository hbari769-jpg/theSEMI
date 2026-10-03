/**
 * Central Database and Domain Model Type Definitions for Aestific
 * Universal TypeScript types shared between Node.js and Cloudflare Worker runtimes.
 * Contains ZERO runtime Node dependencies.
 */

/**
 * Central Data Retention Configuration
 * Evaluated strictly per-message created timestamp (30 days).
 */
export const RETENTION_DAYS = 30;

export type CallPreferenceType = 'Name' | 'Nickname' | 'Username' | 'No preference';
export type TonePreferenceType = 'Friendly' | 'Professional' | 'Direct' | 'Casual' | 'Creative' | 'Tutor';
export type AddressStyleType = 'Formal' | 'Casual' | 'Very Casual' | 'Auto';
export type PersonalLanguageType = 'Auto' | 'বাংলা' | 'English' | 'বাংলা + English';
export type ResponseFeelType = 'Quick' | 'Balanced' | 'Detailed' | 'Deep Explanation';
export type OccupationType = 'Student' | 'Developer' | 'Designer' | 'Business Owner' | 'Researcher' | 'Teacher' | 'Content Creator' | 'Freelancer' | 'Other';
export type WorkingRelationshipType = 'Assistant' | 'Friend' | 'Study Partner' | 'Creative Partner' | 'Work Partner' | 'Technical Partner' | 'Coach';

export interface UserPersonalization {
  callPreference?: CallPreferenceType;
  customCallName?: string;
  tone?: TonePreferenceType;
  addressStyle?: AddressStyleType;
  preferredLanguage?: PersonalLanguageType;
  responseFeel?: ResponseFeelType;
  occupation?: OccupationType;
  customOccupation?: string;
  workContext?: string;
  workingRelationship?: WorkingRelationshipType;
  customInstructions?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  systemPrompt?: string;
  preferredModel?: string;
  memoryEnabled: boolean;
  languagePreference?: string;
  personalization?: UserPersonalization;
  isEmailVerified: boolean;
  status: 'active' | 'suspended' | 'banned';
  isBanned?: boolean;
  bannedAt?: string;
  bannedReason?: string;
  verificationCodeHash?: string;
  verificationCodeExpiresAt?: number;
  verificationAttempts?: number;
  lastVerificationSentAt?: number;
  resetPasswordCodeHash?: string;
  resetPasswordExpiresAt?: number;
  resetPasswordAttempts?: number;
  lastPasswordResetSentAt?: number;
  lastResetRequestSentAt?: number;
  createdAt: string;
  lastActiveAt?: string;
  updatedAt?: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  model?: string;
  lastMessagePreview?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  sender?: 'user' | 'assistant'; // Backwards/forwards compatibility alias
  content: string;
  model?: string;
  modelUsed?: string; // Backwards/forwards compatibility alias
  fileIds?: string[];
  attachments?: any[];
  liked?: boolean;
  disliked?: boolean;
  reactions?: {
    liked?: boolean;
    disliked?: boolean;
  };
  webSearchUsed?: boolean;
  sources?: Array<{
    title: string;
    url: string;
    sourceName?: string;
    domain?: string;
    publishedDate?: string;
    snippet?: string;
  }>;
  createdAt: string;
}

export interface Memory {
  id: string;
  userId: string;
  content: string;
  source?: string;
  category?: 'preference' | 'personal' | 'technical' | 'project' | 'general';
  createdAt: string;
  updatedAt: string;
}

export interface FileRecord {
  id: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  storageProvider: 'supabase' | 'local-fallback';
  bucketName: string;
  storagePath: string;
  uniqueFileId: string;
  filename: string;
  originalName: string;
  type: 'pdf' | 'image' | 'video' | 'audio' | 'other';
  mimeType: string;
  sizeBytes: number;
  url: string;
  extractedText?: string;
  chunks?: Array<{ text: string; page?: number }>;
  isScanned?: boolean;
  pageCount?: number;
  duration?: number;
  createdAt: string;
}

/**
 * Daily Usage Analytics (Purely for telemetry/analytics, NEVER for quota enforcement or user restriction)
 */
export interface DailyUsage {
  id: string;
  userId: string;
  usageDate: string; // YYYY-MM-DD
  chatCount: number;
  photoCount: number;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSettings {
  bannedAdmins: Array<{
    adminName: string;
    bannedAt: string;
    expiresAt: number;
    bannedBy?: string;
  }>;
}

export interface AdminLog {
  id: string;
  adminName: string;
  ip: string;
  action: string;
  details?: string;
  timestamp: string;
}

export interface BannedAdmin {
  adminName: string;
  bannedAt: string;
  expiresAt: number;
  bannedBy?: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'replied' | 'closed';
  adminReply?: string;
  repliedAt?: string;
  repliedBy?: string;
  createdAt: string;
}

export interface AnalyticsDataPoint {
  date: string; // YYYY-MM-DD
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  chats: number;
  photos: number;
  files: number;
}

export interface SystemTelemetry {
  totalUsers: number;
  activeUsersLive: number; // Active in last 15 minutes (Right now)
  activeUsers24h: number;
  activeUsers7d: number;
  activeUsers30d: number;
  userGrowthRate7d: number; // Percentage growth vs previous 7 days
  chatGrowthRate7d: number; // Percentage growth vs previous 7 days
  growthStatus: 'growing' | 'stable' | 'declining';
  totalConversations: number;
  totalMessages: number;
  totalFiles: number;
  todayChatCount: number;
  todayPhotoCount: number;
  todayFileCount: number;
  timeline: AnalyticsDataPoint[]; // Last 14 days of data for charts
}

export interface DatabaseSchema {
  users: User[];
  conversations: Conversation[];
  messages: Message[];
  memories: Memory[];
  files: FileRecord[];
  usageDaily: DailyUsage[];
  adminSettings: AdminSettings;
  adminLogs: AdminLog[];
  supportTickets: SupportTicket[];
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; meta: any }>;
  run(): Promise<{ meta: { changes?: number; last_row_id?: number } }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<any[]>;
  exec(query: string): Promise<any>;
}
