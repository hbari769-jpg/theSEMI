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
  avatarUrl?: string;
  memoryEnabled: boolean;
  preferredModel?: string;
  systemPrompt?: string;
  languagePreference?: string;
  personalization?: UserPersonalization;
  isEmailVerified?: boolean;
  status?: 'active' | 'suspended' | 'banned';
  isBanned?: boolean;
  bannedAt?: string;
  bannedReason?: string;
  createdAt: string;
  lastActiveAt?: string;
}

export interface DocumentChunk {
  index: number;
  text: string;
  page?: number;
}

export interface Attachment {
  id: string;
  name: string;
  filename?: string;
  type: 'pdf' | 'image' | 'video' | 'audio' | 'other';
  mimeType: string;
  size: number;
  url: string;
  previewUrl?: string;
  dataUrl?: string;
  extractedText?: string;
  chunks?: DocumentChunk[];
  isScanned?: boolean;
  pageCount?: number;
  duration?: number;
  createdAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ImageGenerationProgress {
  isGenerating?: boolean;
  phase?: 'understanding' | 'creating' | 'rendering' | 'refining' | 'ready' | 'error';
  label?: string;
  prompt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  fileId?: string;
  fileIds?: string[];
  quantity?: number;
  variations?: boolean;
  error?: string;
}

export interface WebSearchSource {
  title: string;
  url: string;
  sourceName?: string;
  domain?: string;
  publishedDate?: string;
  snippet?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  userId?: string;
  role: MessageRole;
  sender?: 'user' | 'assistant'; // Backwards-compatible alias for existing stored items & components
  content: string;
  attachments?: Attachment[];
  fileIds?: string[];
  liked?: boolean;
  disliked?: boolean;
  reactions?: {
    liked?: boolean;
    disliked?: boolean;
  };
  model?: string;
  modelUsed?: string;
  tokensUsed?: number;
  createdAt: string;
  isStreaming?: boolean;
  imageGen?: ImageGenerationProgress;
  webSearchUsed?: boolean;
  sources?: WebSearchSource[];
  searchState?: {
    isSearching: boolean;
    phase?: 'searching' | 'sources_found' | 'done';
    query?: string;
    sources?: WebSearchSource[];
  };
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  lastMessagePreview: string;
  isPinned: boolean;
  isArchived: boolean;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface Memory {
  id: string;
  userId: string;
  content: string;
  category: 'preference' | 'personal' | 'project' | 'general';
  sourceConversationId?: string;
  sourceConversationTitle?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileRecord {
  id: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  storageProvider?: 'supabase';
  bucketName?: string;
  storagePath?: string;
  uniqueFileId?: string;
  filename: string;
  originalName: string;
  type: 'pdf' | 'image' | 'video' | 'audio' | 'other';
  mimeType: string;
  size: number;
  sizeBytes?: number;
  url: string;
  extractedText?: string;
  chunks?: DocumentChunk[];
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
  usageDate: string;
  chatCount: number;
  photoCount: number;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AIModelOption {
  id: string;
  name: string;
  provider?: string;
  underlyingModel?: string;
  description: string;
  speed: string;
  context: string;
}

export type ActiveView = 'chat' | 'files' | 'memories' | 'settings' | 'terms' | 'documents' | 'secret_verify' | 'support' | 'landing';

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  adminReply?: string;
  status: 'open' | 'replied' | 'closed';
  createdAt: string;
  repliedAt?: string;
  repliedBy?: string;
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

export interface ServerStatus {
  serverGroqConfigured: boolean;
  activeProvider: string;
  activeModelName?: string;
  availableModels?: AIModelOption[];
  databaseProvider?: string;
  storageProvider?: string;
}
