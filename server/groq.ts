import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { db, User } from './db.js';
import { DEFAULT_MODEL_ID, GEMINI_MODELS, GROQ_MODELS, normalizeAndValidateModel } from './models.js';
import { safeLogger } from './error-handler.js';
import {
  isExaSearchConfigured,
  shouldPerformWebSearch,
  searchExa,
  formatExaResultsForPrompt,
  getReadableSourceName,
  getDomainFromUrl,
  type ExaSearchResult,
} from './exa.js';
import { analyzeAndRouteRequest } from './smart-router.js';
import { streamDeepSeekChat, isDeepSeekConfigured } from './deepseek.js';
import { downloadFromSupabase } from './supabase-storage.js';
import {
  AESTIFIC_IDENTITY_SYSTEM_DIRECTIVE,
  detectIdentityIntent,
  sanitizeIdentityHallucinations,
} from './identity.js';
import { getActiveBehaviorDirectives } from './behavior-store.js';

const UPLOADS_DIR = path.resolve('uploads');

// Lazy Gemini client initialization for all Chat, Coding, Reasoning, and Multimodal tasks
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.API_KEY ||
    ''
  ).trim();
  if (!apiKey || apiKey.startsWith('MY_') || apiKey.startsWith('YOUR_') || apiKey.length < 10) {
    return null;
  }
  try {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (e) {
    safeLogger.error('Failed to initialize Gemini client:', e);
    return null;
  }
}

// Optional Groq client for Whisper audio transcription
export function getGroqClient(): Groq | null {
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey || apiKey.startsWith('MY_') || apiKey.startsWith('YOUR_') || apiKey.length < 5) {
    return null;
  }
  try {
    return new Groq({ apiKey });
  } catch (e) {
    safeLogger.error('Failed to initialize Groq client:', e);
    return null;
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface MediaAttachmentInput {
  type: 'image' | 'video' | 'audio' | 'pdf' | 'other';
  mimeType: string;
  dataBase64?: string;
  filename?: string;
  originalName?: string;
  size?: number;
}

export interface AiEnginePreferences {
  engine?: 'auto' | 'fast' | 'deep';
  intelligence?: 'balanced' | 'precise' | 'creative';
  context?: 'on' | 'off';
  responseLength?: 'auto' | 'short' | 'medium' | 'detailed';
}

export interface WebSearchProgressStatus {
  phase: 'searching' | 'sources_found';
  query?: string;
  sources?: ExaSearchResult[];
}

export interface ChatCompletionParams {
  user: User;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  imageUrls?: string[];
  mediaAttachments?: MediaAttachmentInput[];
  systemInstruction?: string;
  aiEnginePreferences?: AiEnginePreferences;
  onSearchProgress?: (status: WebSearchProgressStatus) => void;
}

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/bmp'
]);

const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg', 'video/ogg', 'video/x-matroska', 'video/avi'
]);

export function buildPersonalizationDirective(user: User): string {
  const p = user.personalization || {};

  // 1. Determine Preferred Name
  let resolvedName = '';
  if (p.customCallName && p.customCallName.trim()) {
    resolvedName = p.customCallName.trim();
  } else if (p.callPreference === 'Name' || p.callPreference === 'Username' || (p.callPreference !== 'No preference' && user.name)) {
    resolvedName = (user.name || '').trim();
  }

  const items: string[] = [];

  // Preferred name
  if (resolvedName && p.callPreference !== 'No preference') {
    items.push(`* Preferred name: \`${resolvedName}\``);
  } else if (p.callPreference === 'No preference') {
    items.push(`* Preferred name: \`No preference\``);
  } else if (user.name && user.name.trim()) {
    resolvedName = user.name.trim();
    items.push(`* Preferred name: \`${resolvedName}\``);
  }

  // Addressing style
  if (p.addressStyle) {
    items.push(`* Addressing style: \`${p.addressStyle}\``);
  }

  // Communication style (Tone)
  if (p.tone) {
    items.push(`* Communication style: \`${p.tone}\``);
  }

  // Language
  const lang = p.preferredLanguage || user.languagePreference;
  if (lang) {
    items.push(`* Language: \`${lang}\``);
  }

  // Answer style
  if (p.responseFeel) {
    items.push(`* Answer style: \`${p.responseFeel}\``);
  }

  // Occupation & Context
  const occ = p.occupation === 'Other' && p.customOccupation?.trim() ? p.customOccupation.trim() : p.occupation;
  if (occ) {
    items.push(`* Occupation: \`${occ}\``);
  }
  if (p.workContext?.trim()) {
    items.push(`* Work/Study context: \`${p.workContext.trim()}\``);
  }

  // Working relationship
  if (p.workingRelationship) {
    items.push(`* Working relationship: \`${p.workingRelationship}\``);
  }

  // Custom instructions
  if (p.customInstructions?.trim()) {
    items.push(`* Custom instructions: \`${p.customInstructions.trim()}\``);
  }

  if (items.length === 0) return '';

  const rules: string[] = [];

  if (resolvedName && p.callPreference !== 'No preference') {
    rules.push(`- PREFERRED NAME: The user's name is "${resolvedName}". Address them directly and naturally as "${resolvedName}" in your greetings and conversation (e.g., "Hey ${resolvedName}!", "Sure ${resolvedName}, ...", or in Bengali "আরে ${resolvedName}, ...", "বলো ${resolvedName}, ..."). Note: Addressing user ${resolvedName} by their name is expected and does NOT violate any creator policy.`);
  }

  if (p.addressStyle === 'Very Casual') {
    rules.push(`- VERY CASUAL ADDRESSING: Adopt an ultra-casual, laid-back, friendly peer tone. In Bengali (বাংলা), use natural colloquial conversational phrasing (use familiar "তুমি" or close-friend "তুই", friendly informal diction like "কী অবস্থা", "বলো", "দোস্ত", dropping rigid formal "আপনি/করুন/বলুন" completely). In English, use relaxed, informal speech ("Hey", "what's up", "no worries").`);
  } else if (p.addressStyle === 'Casual') {
    rules.push(`- CASUAL ADDRESSING: Casual and friendly. In Bengali, use familiar "তুমি" form ("বলো", "কেমন আছো"); in English, relaxed and warm conversational tone.`);
  } else if (p.addressStyle === 'Formal') {
    rules.push(`- FORMAL ADDRESSING: Formal, courteous, and polite. In Bengali, use respectful "আপনি" form ("বলুন", "কেমন আছেন"); in English, courteous, polite, and dignified.`);
  } else if (p.addressStyle === 'Auto') {
    rules.push(`- AUTO ADDRESSING: Adapt formality dynamically to match the context and tone of the user's message.`);
  }

  if (p.workingRelationship === 'Friend') {
    rules.push(`- WORKING RELATIONSHIP (Friend): Treat the user as a close, trusted friend—warm, empathetic, relatable, and conversational, while still providing master-class assistance.`);
  } else if (p.workingRelationship === 'Assistant') {
    rules.push(`- WORKING RELATIONSHIP (Assistant): Executive assistant dynamic—proactive, organized, highly capable, and task-focused.`);
  } else if (p.workingRelationship === 'Study Partner') {
    rules.push(`- WORKING RELATIONSHIP (Study Partner): Actively assist with learning, test comprehension, summarize concepts, and work through problems collaboratively.`);
  } else if (p.workingRelationship === 'Creative Partner') {
    rules.push(`- WORKING RELATIONSHIP (Creative Partner): Act as a creative brainstormer and collaborator, offering inventive angles and sparking ideas.`);
  } else if (p.workingRelationship === 'Work Partner') {
    rules.push(`- WORKING RELATIONSHIP (Work Partner): Co-work on deliverables, anticipate project needs, provide peer feedback, and drive work forward.`);
  } else if (p.workingRelationship === 'Technical Partner') {
    rules.push(`- WORKING RELATIONSHIP (Technical Partner): Senior engineering co-pilot—focus on architecture, edge cases, optimal code, and technical rigor.`);
  } else if (p.workingRelationship === 'Coach') {
    rules.push(`- WORKING RELATIONSHIP (Coach): Guiding questions, constructive feedback, goal-setting, and encouraging disciplined progress.`);
  }

  if (p.tone) {
    switch (p.tone) {
      case 'Friendly':
        rules.push(`- TONE (Friendly): Warm, approachable, cheerful, and encouraging, maintaining positive energy.`);
        break;
      case 'Professional':
        rules.push(`- TONE (Professional): Articulate, polished, courteous, and objective with well-reasoned explanations.`);
        break;
      case 'Direct':
        rules.push(`- TONE (Direct): Straight to the point, concise, eliminating filler, pleasantries, and unnecessary preamble.`);
        break;
      case 'Casual':
        rules.push(`- TONE (Casual): Relaxed, conversational, and natural—like an intelligent peer.`);
        break;
      case 'Creative':
        rules.push(`- TONE (Creative): Expressive, vivid, imaginative, engaging, and rich in descriptive perspectives.`);
        break;
      case 'Tutor':
        rules.push(`- TONE (Tutor): Patient, pedagogical, step-by-step explanations, helpful analogies, guiding understanding constructively.`);
        break;
    }
  }

  if (lang === 'বাংলা') {
    rules.push(`- MANDATORY BENGALI (বাংলা): You MUST deliver all conversational text, explanations, greetings, and reasoning in natural, fluent Bengali (বাংলা). If the addressing style is casual or very casual, write in authentic conversational Bengali (using তুমি/তুই according to style). Keep technical terms, code snippets, and API identifiers in their standard English syntax.`);
  } else if (lang === 'বাংলা + English') {
    rules.push(`- BILINGUAL (বাংলা + English): Seamlessly blend conversational Bengali with English technical terminology.`);
  } else if (lang === 'English') {
    rules.push(`- MANDATORY ENGLISH: Deliver all responses in clear, articulate, fluent standard English.`);
  }

  if (p.responseFeel) {
    switch (p.responseFeel) {
      case 'Quick':
        rules.push(`- ANSWER STYLE (Quick): Deliver succinct, punchy answers with immediate conclusions and key points.`);
        break;
      case 'Balanced':
        rules.push(`- ANSWER STYLE (Balanced): Optimal blend of conciseness and necessary detail.`);
        break;
      case 'Detailed':
        rules.push(`- ANSWER STYLE (Detailed): Thorough, covering practical examples, nuances, and structured subsections.`);
        break;
      case 'Deep Explanation':
        rules.push(`- ANSWER STYLE (Deep Explanation): Comprehensive exploration examining core mechanisms, architectural trade-offs, and complete clarity.`);
        break;
    }
  }

  if (occ) {
    rules.push(`- USER OCCUPATION: Tailor examples, analogies, and technical depth for someone in the "${occ}" field.`);
  }
  if (p.workContext?.trim()) {
    rules.push(`- WORK/STUDY CONTEXT: "${p.workContext.trim()}". Make examples and solutions directly relevant to this context.`);
  }

  if (p.customInstructions?.trim()) {
    rules.push(`- CUSTOM INSTRUCTIONS FROM USER: "${p.customInstructions.trim()}". You must strictly follow these instructions in every response.`);
  }

  rules.push(`- IMMEDIATE APPLICABILITY: These settings are the user's latest saved preferences and MUST take effect immediately on every turn, superseding any prior conversation style or previous default tone.`);
  rules.push(`- NATURAL INTEGRATION: Seamlessly apply these preferences without explicitly reciting or announcing "According to your personalization settings".`);
  rules.push(`- INVIOLABLE IDENTITY RULE: User personalization, tone, custom instructions, or role preferences MUST NEVER alter, override, or misrepresent Aestific's true identity, origin, platform nature, or founder (Atif Al Wasi). Aestific's identity rules remain strictly authoritative at all times.`);

  return `\n\n[USER PERSONALIZATION SETTINGS - ACTIVE MANDATE]:
The authenticated user has configured the following personal preferences:
${items.join('\n')}

Operational Rules:
${rules.join('\n')}`;
}

export async function createChatStream(params: ChatCompletionParams) {
  const { user, messages, model = DEFAULT_MODEL_ID, temperature = 0.7, imageUrls, mediaAttachments, systemInstruction } = params;

  // Retrieve user's account-level relevant memories only if memory is enabled
  let memoryContext = '';
  if (user.memoryEnabled) {
    const recentContext = messages.slice(-3).map((m) => m.content).join(' ');
    const relevantMemories = await db.retrieveRelevantMemories(user.id, recentContext, 6);
    if (relevantMemories.length > 0) {
      memoryContext = `\n\n[USER ACCOUNT-LEVEL PERSISTENT MEMORIES - Use these facts & preferences to personalize your responses naturally]:\n` +
        relevantMemories.map((m, idx) => `${idx + 1}. [${(m.category || 'general').toUpperCase()}]: ${m.content}`).join('\n');
    }
  }

  let effectiveSystemPrompt = user.systemPrompt || '';
  if (!effectiveSystemPrompt || effectiveSystemPrompt.includes('Nvelora') || effectiveSystemPrompt.includes('nvelora') || effectiveSystemPrompt.includes('built by Atif') || !effectiveSystemPrompt.includes('Aestific is an AI platform')) {
    effectiveSystemPrompt = `You are Aestific, an advanced, highly intelligent AI assistant. Aestific is an AI platform that brings together different AI models and intelligently uses the one best suited for each task—all through one simple interface. Aestific was founded and built by Atif Al Wasi. You are designed for master-class reasoning, programming, analysis, multilingual communication (fluent in Bengali / বাংলা, English, and other languages), and creative problem solving.`;
  }

  const userPref = (user.personalization?.preferredLanguage || user.languagePreference || '').trim();
  const lowerPref = userPref.toLowerCase();

  let languageDirective = `3. **Language Matching & Natural Flow**:
   - Always respond in the EXACT same language the user communicates in.
   - If the user asks in Bengali (বাংলা), answer in natural, clear, accurate, and fluent standard Bengali.
   - If the user asks in English, answer in articulate, precise, and well-structured English.
   - If the user asks in Banglish (Bengali written in English letters like "kemon acho", "amake bolo"), respond in clear, natural Bengali (বাংলা) so that the user understands effortlessly.`;

  if (userPref === 'English' || lowerPref === 'english' || lowerPref === 'en') {
    languageDirective = `3. **CRITICAL - MANDATORY RESPONSE LANGUAGE (ENGLISH)**:
   - The user has configured their Response Language preference explicitly to **English**.
   - You MUST generate your entire conversational response, explanations, reasoning, and text in articulate, precise, natural, and standard English, regardless of whether the user prompts in English, Bengali (বাংলা), Banglish, or another language.
   - (Exception: ONLY output another language if the user explicitly asks for translation, e.g., "translate this to French/Bengali").`;
  } else if (userPref === 'বাংলা' || lowerPref === 'bengali' || lowerPref === 'bangla' || lowerPref === 'bn') {
    const isCasual = user.personalization?.addressStyle === 'Very Casual' || user.personalization?.addressStyle === 'Casual' || user.personalization?.workingRelationship === 'Friend';
    languageDirective = `3. **CRITICAL - MANDATORY RESPONSE LANGUAGE (BENGALI / বাংলা)**:
   - The user has configured their Response Language preference explicitly to **বাংলা (Bengali)**.
   - You MUST generate your entire conversational response, explanations, reasoning, and text in natural, clear, accurate, and fluent Bengali (বাংলা), regardless of whether the user prompts in English, Banglish, or another language.${isCasual ? ' Adopt the user\'s casual addressing style (use familiar "তুমি" or close-friend "তুই", conversational friendly phrasing, without stiff formal "আপনি/বলুন/করুন" forms).' : ''} Code syntax, code blocks, technical keywords, and API names should remain in their proper technical form.
   - (Exception: ONLY output another language if the user explicitly asks for translation, e.g., "translate this to English/Spanish").`;
  } else if (userPref === 'বাংলা + English' || lowerPref.includes('বাংলা + english') || lowerPref.includes('bangla + english')) {
    languageDirective = `3. **CRITICAL - BILINGUAL RESPONSE MODE (বাংলা + ENGLISH)**:
   - The user has configured their Response Language preference to **বাংলা + English (Bilingual)**.
   - You should blend Bengali and English naturally: explain concepts in natural, conversational Bengali (বাংলা) while expressing technical terms, framework names, key domain concepts, and code in English.`;
  } else if (userPref && userPref !== 'Auto' && lowerPref !== 'auto') {
    languageDirective = `3. **CRITICAL - MANDATORY RESPONSE LANGUAGE**:
   - The user has configured their Response Language preference explicitly to **${userPref}**.
   - You MUST generate your response in fluent, natural **${userPref}**, regardless of prompt language.`;
  }

  const nowClock = new Date();
  const liveBdTime = nowClock.toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const baseSystemPrompt = effectiveSystemPrompt + `

[CURRENT REAL-TIME CLOCK]:
- Current Live Date & Time (Bangladesh Standard Time / Asia/Dhaka): ${liveBdTime}
- Current Year: ${nowClock.getFullYear()}

Key Directives:
1. ${AESTIFIC_IDENTITY_SYSTEM_DIRECTIVE}
2. **CRITICAL - NO JSON TOOL CALLS OR CODE ACTIONS**:
   - NEVER output raw JSON tool/function calls (such as action dalle.text2im, action_input, tool_call, or pseudo-JSON commands).
   - You do NOT have internal function execution tools in this chat. Always reply directly in natural conversational language.
${languageDirective}
4. **Coding & Technical Precision**:
   - When asked to write code, provide clean, idiomatic, production-ready code with strict typing and robust error handling.
   - Provide clear, step-by-step reasoning for complex problem solving, algorithms, and analytical questions.
5. **Native In-Chat Image & Picture Generation Protocol (ANY Language & Phrasing)**:
   - Aestific has native, built-in text-to-image generation directly inside this chat system.
   - Whenever the user asks in chat to create, generate, draw, make, design, modify, or show an image, photo, picture, portrait, anime, illustration, logo, or visual scene in ANY language (including Bengali / বাংলা, Banglish, English, Hindi, Urdu, Arabic, Spanish, etc., even with spelling mistakes like "chobu banat", indirect phrasing like "এটা বানিয়ে দাও" / "এরকম একটা দাও", pure visual scene descriptions, or follow-up changes to a previous image):
     - NEVER apologize or say "I cannot generate images", "আমি সরাসরি ছবি তৈরি করতে পারি না", "ছবি জেনারেট করা সম্ভব নয়", or "I am a language model / টেক্সট-ভিত্তিক এআই".
     - NEVER tell the user to copy a prompt into an external image generator tool.
     - DO NOT output raw JSON tool calls (like dalle.text2im or action_input).
     - Instead, output ONLY a single command line starting with "/image " followed by the accurate, detailed English visual prompt describing the exact scene requested by the user (for example: /image A realistic portrait of a young boy standing confidently, wearing a bright yellow t-shirt and comfortable half-pants, daylight setting, high resolution).
     - Do NOT include any other text before or after the /image line. The Aestific server automatically intercepts /image and renders the real generated image directly in the user's chat!
6. **Deep Accuracy & Formatting**:
   - Provide deeply accurate, thoughtful, and high-quality answers. Explain concepts clearly with well-organized formatting, markdown headings, bullet points, and code blocks.
7. **Documents & Attachments**:
   - When documents, PDFs, code files, or text attachments are provided, analyze them thoroughly, cite specifics, and answer questions directly based on the uploaded content.
8. **Images & Visual Media**:
   - Carefully inspect and identify all visible objects, people, scenes, text/OCR, colors, emotions, and contexts.
   - Describe what is depicted accurately and answer the user's specific question about the image with deep clarity.
   - Never fabricate or guess contents of an image that you cannot see.`;

  const hasImages = Boolean(imageUrls && imageUrls.length > 0);
  const hasMediaAttachments = Boolean(mediaAttachments && mediaAttachments.length > 0);

  // 1. Smart Route Analysis & Intent Detection
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const route = analyzeAndRouteRequest(lastUserMessage, {
    hasMediaAttachments: hasImages || hasMediaAttachments,
    explicitModelPreference: model,
  });

  // 2. Intelligent Live Web Search & Direct Link Reader Flow
  let webSearchPromptContext = '';
  let webSearchSources: ExaSearchResult[] = [];
  if (route.requiresWebSearch && isExaSearchConfigured()) {
    try {
      params.onSearchProgress?.({
        phase: 'searching',
        query: lastUserMessage,
      });

      const exaResults = await searchExa(lastUserMessage, { numResults: 6 });
      if (exaResults && exaResults.length > 0) {
        webSearchSources = exaResults;
        params.onSearchProgress?.({
          phase: 'sources_found',
          query: lastUserMessage,
          sources: exaResults,
        });
        webSearchPromptContext = formatExaResultsForPrompt(lastUserMessage, exaResults);
      } else {
        webSearchPromptContext = formatExaResultsForPrompt(lastUserMessage, []);
      }
    } catch (searchErr) {
      safeLogger.warn('Live web search encountered an issue, proceeding with internal knowledge:', searchErr);
    }
  }

  let enginePreferencesPrompt = '';
  if (params.aiEnginePreferences) {
    const p = params.aiEnginePreferences;
    const directives: string[] = [];

    // Engine preference (Fast / Deep; Auto is default normal behavior)
    if (p.engine === 'fast') {
      directives.push('- Engine preference (Fast): Prioritize immediate, rapid, direct responses with minimal preamble.');
    } else if (p.engine === 'deep') {
      directives.push('- Engine preference (Deep): Provide deep analysis, comprehensive reasoning, nuanced exploration, and thorough explanations.');
    }

    // Intelligence preference (Precise / Creative; Balanced is default normal behavior)
    if (p.intelligence === 'precise') {
      directives.push('- Intelligence preference (Precise): Ensure responses are exact, technically rigorous, highly accurate, clear, and focused. Avoid speculation.');
    } else if (p.intelligence === 'creative') {
      directives.push('- Intelligence preference (Creative): Provide imaginative, expressive, and innovative answers when appropriate, using vivid metaphors and creative approaches.');
    }

    // Response Length preference (Short / Medium / Detailed; Auto is default normal behavior)
    if (p.responseLength === 'short') {
      directives.push('- Response Length preference (Short): Keep responses brief, concise, and straight to the point without unnecessary elaboration.');
    } else if (p.responseLength === 'medium') {
      directives.push('- Response Length preference (Medium): Provide balanced, moderate-length responses.');
    } else if (p.responseLength === 'detailed') {
      directives.push('- Response Length preference (Detailed): Provide comprehensive, exhaustive, and detailed answers covering all angles and examples.');
    }

    if (directives.length > 0) {
      enginePreferencesPrompt = `\n\n[USER AI ENGINE PREFERENCES]:\n` + directives.join('\n');
    }
  }

  const personalizationPrompt = buildPersonalizationDirective(user);
  const globalBehaviorPrompt = getActiveBehaviorDirectives();

  const fullSystemPrompt = `${baseSystemPrompt}${globalBehaviorPrompt}${memoryContext}${webSearchPromptContext}${enginePreferencesPrompt}${personalizationPrompt}${systemInstruction ? `\n\nAdditional Instructions: ${systemInstruction}` : ''}`;

  // 3. Coding & Reasoning Specialist: DeepSeek V4 Flash
  // If request is classified as coding/reasoning, invoke DeepSeek directly if configured
  if (route.primaryProvider === 'deepseek' && !hasImages && !hasMediaAttachments && isDeepSeekConfigured()) {
    try {
      const deepseekResult = await streamDeepSeekChat({
        messages: messages.map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        })),
        systemPrompt: fullSystemPrompt,
        temperature,
        model: 'deepseek-v4-flash',
      });

      return {
        provider: 'deepseek' as const,
        model: 'Aestific Reason',
        stream: deepseekResult.stream,
        webSearchUsed: Boolean(route.requiresWebSearch),
        webSearchSources,
      };
    } catch (deepseekErr: any) {
      safeLogger.warn('DeepSeek provider encountered an issue, seamlessly engaging Gemini/Groq fallback chain:', deepseekErr?.message || deepseekErr);
    }
  }

  const gemini = getGeminiClient();
  const groq = getGroqClient();

  if (!gemini && !groq) {
    throw new Error('Aestific AI service is temporarily initializing. Please try again in a few moments.');
  }

  if (hasImages && imageUrls && imageUrls.length > 5) {
    throw new Error('Maximum of 5 images can be analyzed in a single request.');
  }

  // Format messages into Gemini contents structure
  const rawContents: any[] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    const isLast = i === messages.length - 1;
    const role = m.role === 'assistant' ? 'model' : 'user';

    if (isLast && m.role === 'user') {
      const parts: any[] = [];
      const textPrompt = m.content && m.content !== '(Uploaded attachment)' 
        ? m.content 
        : 'Please thoroughly inspect and analyze the attached media file(s). Identify key subjects, text/OCR, context, details, and answer any implied or direct question.';
      parts.push({ text: textPrompt });

      // Process Image URLs
      if (imageUrls) {
        for (const imgUrl of imageUrls) {
          if (imgUrl.startsWith('data:')) {
            const match = imgUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const mimeType = match[1].toLowerCase();
              if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
                throw new Error(`Unsupported image format (${mimeType}). Supported formats: JPEG, PNG, WEBP, GIF, HEIC, BMP.`);
              }
              parts.push({
                inlineData: {
                  mimeType,
                  data: match[2],
                },
              });
            }
          } else if (imgUrl.startsWith('/api/files/download/')) {
            const filename = path.basename(imgUrl.split('?')[0]);
            const filePath = path.resolve(UPLOADS_DIR, filename);
            const isProd = process.env.NODE_ENV === 'production';
            let fileBuf: Buffer | null = null;
            if (isProd) {
              const supabaseBuffer = await downloadFromSupabase(filename, filename);
              if (supabaseBuffer) {
                if (supabaseBuffer.length > 25 * 1024 * 1024) {
                  throw new Error(`Image "${filename}" exceeds maximum size of 25MB.`);
                }
                fileBuf = supabaseBuffer;
              }
            } else {
              if (filePath.startsWith(UPLOADS_DIR) && fs.existsSync(filePath)) {
                const stat = fs.statSync(filePath);
                if (stat.size > 25 * 1024 * 1024) {
                  throw new Error(`Image "${filename}" exceeds maximum size of 25MB.`);
                }
                fileBuf = fs.readFileSync(filePath);
              } else {
                const supabaseBuffer = await downloadFromSupabase(filename, filename);
                if (supabaseBuffer) {
                  if (supabaseBuffer.length > 25 * 1024 * 1024) {
                    throw new Error(`Image "${filename}" exceeds maximum size of 25MB.`);
                  }
                  fileBuf = supabaseBuffer;
                }
              }
            }
            if (fileBuf) {
              const ext = path.extname(filename).toLowerCase().replace('.', '') || 'jpeg';
              const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
              parts.push({
                inlineData: {
                  mimeType: mime,
                  data: fileBuf.toString('base64'),
                },
              });
            }
          }
        }
      }

      // Process Rich Media Attachments (Video, PDF & Audio)
      if (mediaAttachments) {
        for (const media of mediaAttachments) {
          if (media.type === 'video' && media.dataBase64) {
            const mime = media.mimeType.toLowerCase();
            if (!SUPPORTED_VIDEO_MIME_TYPES.has(mime) && !mime.startsWith('video/')) {
              throw new Error(`Unsupported video format (${media.mimeType}). Supported formats: MP4, WebM, MOV, MPEG.`);
            }
            parts.push({
              inlineData: {
                mimeType: mime || 'video/mp4',
                data: media.dataBase64,
              },
            });
          } else if (media.type === 'pdf' && media.dataBase64) {
            parts.push({
              inlineData: {
                mimeType: 'application/pdf',
                data: media.dataBase64,
              },
            });
          }
        }
      }

      rawContents.push({ role, parts });
    } else {
      if (m.content && m.content.trim()) {
        rawContents.push({
          role,
          parts: [{ text: m.content }],
        });
      }
    }
  }

  // Normalize contents to ensure alternating user/model sequence and no empty turns
  const contents: any[] = [];
  for (const c of rawContents) {
    if (contents.length > 0 && contents[contents.length - 1].role === c.role) {
      // Merge adjacent parts with identical role
      contents[contents.length - 1].parts.push(...c.parts);
    } else {
      contents.push(c);
    }
  }

  // Ensure conversation starts with user role
  if (contents.length > 0 && contents[0].role !== 'user') {
    contents.unshift({
      role: 'user',
      parts: [{ text: 'Hello' }],
    });
  }

  // Fallback if contents is empty
  if (contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: 'Hello' }],
    });
  }

  // 4. Gemini Execution via Smart Route Candidates
  if (gemini) {
    const validatedRequestedModel = (model && model !== 'default' && model !== 'auto' && !model.includes('deepseek'))
      ? normalizeAndValidateModel(model)
      : null;

    let candidateModels: string[];
    if (validatedRequestedModel === 'gemini-3.6-flash' || route.category === 'hard_reasoning') {
      candidateModels = ['gemini-2.5-flash', 'gemini-flash-latest', GEMINI_MODELS.MAIN];
    } else {
      candidateModels = ['gemini-2.5-flash', 'gemini-flash-latest', GEMINI_MODELS.MAIN];
    }

    let lastGeminiErr: any = null;

    for (const targetModel of candidateModels) {
      try {
        let responseStream: any;
        if (route.requiresWebSearch && !hasImages && !hasMediaAttachments) {
          try {
            responseStream = await gemini.models.generateContentStream({
              model: targetModel,
              contents,
              config: {
                systemInstruction: fullSystemPrompt,
                temperature,
                tools: [{ googleSearch: {} }],
              },
            });
          } catch {
            responseStream = await gemini.models.generateContentStream({
              model: targetModel,
              contents,
              config: {
                systemInstruction: fullSystemPrompt,
                temperature,
              },
            });
          }
        } else {
          responseStream = await gemini.models.generateContentStream({
            model: targetModel,
            contents,
            config: {
              systemInstruction: fullSystemPrompt,
              temperature,
            },
          });
        }

        return {
          provider: 'gemini',
          model: targetModel === 'gemini-3.1-flash-lite'
            ? 'Gemini 3.1 Flash-Lite'
            : targetModel === 'gemini-3.6-flash'
            ? 'Gemini 3.6 Flash'
            : targetModel,
          stream: responseStream,
          webSearchUsed: Boolean(route.requiresWebSearch),
          webSearchSources,
        };
      } catch (err: any) {
        lastGeminiErr = err;
        safeLogger.warn(`[Gemini Model: ${targetModel}] stream attempt note:`, err?.message || err);
      }
    }

    if (!groq && lastGeminiErr) {
      const msg = (lastGeminiErr?.message || '').toLowerCase();
      if (msg.includes('safety') || msg.includes('blocked')) {
        throw new Error('This request was blocked by AI safety guidelines. Please modify your query and try again.');
      }
      if (msg.includes('rate limit') || msg.includes('quota') || msg.includes('429')) {
        throw new Error('AI service capacity is temporarily busy. Please wait a few moments and try again.');
      }
      throw new Error('Aestific AI is temporarily unavailable. Please try again in a few moments.');
    }
  }

  // 2. Resilient Groq Fallback if Gemini failed or is not available
  if (groq) {
    const groqCandidates = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'];
    for (const groqModel of groqCandidates) {
      try {
        const groqMessages = [
          { role: 'system' as const, content: fullSystemPrompt },
          ...messages.map((m) => ({
            role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            content: m.content,
          })),
        ];

        const groqStream = await groq.chat.completions.create({
          model: groqModel,
          messages: groqMessages,
          temperature,
          stream: true,
        });

        return {
          provider: 'groq',
          model: 'Aestific Intelligence (Groq Engine)',
          stream: groqStream,
          webSearchUsed: Boolean(route.requiresWebSearch),
          webSearchSources,
        };
      } catch (groqErr: any) {
        safeLogger.warn(`Groq model ${groqModel} stream note:`, groqErr?.message || groqErr);
      }
    }
    throw new Error('Aestific AI is temporarily unavailable. Please try again in a few moments.');
  }

  throw new Error('Aestific AI is temporarily unavailable. Please check your connection and try again.');
}

// Comprehensive Banglish/Bengali visual dictionary and translation fallback
function translateBanglishAndBengaliOffline(rawPrompt: string): string {
  let text = (rawPrompt || '').trim();

  // Strip common request framing
  text = text.replace(/\b(?:chobi|chobu|chabi|cobi|cabi|sobi|shobi|subi|pic|pik|picture|pikchar|photo|poto|foto|image|imej|imaj|drawing|portrait|illustration)\s+(?:banao|banaw|banan|banat|banate|banai\s+dao|banai\s+deo|banai\s+de|banaye\s+dao|banaye\s+deo|banaye\s+de|banaye\s+dey|baniye\s+dao|baniye\s+deo|baniye\s+de|banaya\s+dao|banaya\s+de|banaia\s+dao|banaia\s+de|banay\s+daw|banay\s+dao|banay\s+de|banay\s+deo|toiri\s+koro|toiri\s+kore\s+dao|toiri\s+kore\s+deo|akho|aako|ako|anko|ake\s+dao|eke\s+dao|draw\s+koro|make\s+koro|generate\s+koro|dao|deo|den|de|dekhao|dakhaw|dikhaw|chai|chaisi|lagbe|dorkar)\b/gi, '');
  text = text.replace(/\b(?:banao|banaw|banan|banat|banate|banai\s+dao|banai\s+deo|banai\s+de|banaye\s+dao|banaye\s+deo|banaye\s+de|baniye\s+dao|baniye\s+deo|baniye\s+de|banaya\s+dao|banaya\s+de|banaia\s+dao|banaia\s+de|banay\s+daw|banay\s+dao|banay\s+de|banay\s+deo|toiri\s+koro|toiri\s+kore\s+dao|toiri\s+kore\s+deo|akho|aako|ako|anko|ake\s+dao|eke\s+dao|draw\s+koro|make\s+koro|generate\s+koro|dekhao|dakhaw|dikhaw)\s+(?:ekta\s+|akta\s+|ekti\s+)?(?:chobi|chobu|chabi|cobi|cabi|sobi|shobi|subi|pic|pik|picture|photo|poto|foto|image|imej|imaj)?\b/gi, '');
  text = text.replace(/^(?:amake\s+|amar\s+jonno\s+)?(?:please\s+|plz\s+)?(?:doya\s+kore\s+)?(?:ekta|akta|ekti|ekkhana)\s+/i, '');
  text = text.replace(/\b(?:er\s+)?(?:chobi|chobu|chabi|cobi|cabi|sobi|shobi|subi|pic|pik|picture|photo|poto|foto|image|imej|imaj)\s*$/gi, '');
  text = text.replace(/\b(?:banao|banaw|banan|banat|banate|banai\s+dao|banai\s+deo|banai\s+de|banaye\s+dao|banaye\s+deo|banaye\s+de|baniye\s+dao|baniye\s+deo|baniye\s+de|banaya\s+dao|banaya\s+de|banaia\s+dao|banaia\s+de|banay\s+daw|banay\s+dao|banay\s+de|banay\s+deo|toiri\s+koro|toiri\s+kore\s+dao|toiri\s+kore\s+deo|akho|aako|ako|anko|dekhao|dakhaw|dikhaw)\s*$/gi, '');
  text = text.replace(/\b(?:emon|erokom|oirokom)\s+(?:chobi|chobu|akta|ekta)\b/gi, '');

  // Bengali Unicode script dictionary mapping
  const bengaliScriptMap: Record<string, string> = {
    'একটি': 'a', 'একটা': 'a', 'একখানা': 'a', 'একজন': 'a', 'সুন্দর': 'beautiful', 'মনোরম': 'serene', 'চমৎকার': 'stunning',
    'লাল': 'red', 'কালো': 'black', 'সাদা': 'white', 'নীল': 'blue', 'সবুজ': 'green', 'হলুদ': 'yellow', 'কমলা': 'orange', 'গোলাপি': 'pink', 'বেগুনি': 'purple', 'সোনালী': 'golden', 'রুপালি': 'silver', 'বাদামী': 'brown',
    'টি-শার্ট': 't-shirt', 'টিশার্ট': 't-shirt', 'গেঞ্জি': 't-shirt', 'হাফ প্যান্ট': 'half-pants shorts', 'হাফপ্যান্ট': 'half-pants shorts', 'প্যান্ট': 'pants', 'শার্ট': 'shirt', 'শাড়ি': 'saree', 'শাড়ি': 'saree', 'পাঞ্জাবি': 'panjabi', 'জামা': 'outfit', 'পোশাক': 'clothing', 'জুতা': 'shoes', 'চশমা': 'glasses', 'টুপি': 'hat', 'পরে': 'wearing', 'পরা': 'wearing', 'পড়ে': 'wearing', 'পরহিত': 'wearing', 'আর': 'and', 'এবং': 'and',
    'পাখি': 'bird', 'পাখির': 'bird', 'মুরগি': 'chicken', 'মুরগির': 'chicken', 'মুরগী': 'chicken', 'মুরগীর': 'chicken', 'মোরগ': 'rooster', 'মোরগের': 'rooster', 'হাঁস': 'duck', 'হাঁসের': 'duck', 'কবুতর': 'pigeon', 'দোয়েল': 'magpie robin bird', 'দোয়েল': 'magpie robin bird', 'টিয়া': 'parrot', 'টিয়া': 'parrot', 'ময়ূর': 'peacock', 'ময়ূর': 'peacock', 'কাক': 'crow',
    'গাড়ি': 'car', 'গাড়ি': 'car', 'গাড়ির': 'car', 'গাড়ির': 'car', 'নদী': 'river', 'নদীর': 'river',
    'পাহাড়': 'mountain', 'পাহাড়': 'mountain', 'পাহাড়ের': 'mountain', 'পাহাড়ের': 'mountain',
    'মেয়ে': 'girl', 'মেয়ে': 'girl', 'মেয়ের': 'girl', 'মেয়ের': 'girl', 'নারী': 'woman', 'মহিলা': 'woman',
    'ছেলে': 'boy', 'ছেলের': 'boy', 'বালক': 'young boy', 'বালিকা': 'young girl', 'পুরুষ': 'man', 'লোক': 'man', 'মানুষ': 'person', 'বাচ্চা': 'child', 'শিশু': 'child', 'বৃদ্ধ': 'old man', 'বৃদ্ধা': 'old woman',
    'চাঁদ': 'moon', 'চাঁদের': 'moon', 'সূর্য': 'sun', 'সূর্যের': 'sun', 'তারা': 'stars',
    'গ্রাম': 'village', 'গ্রামের': 'village', 'শহর': 'city', 'শহরের': 'city', 'রাস্তা': 'street', 'রাস্তায়': 'on the street',
    'বৃষ্টি': 'rain', 'বৃষ্টির': 'rain', 'পুকুর': 'pond', 'নৌকা': 'wooden boat', 'নৌকার': 'wooden boat', 'জাহাজ': 'ship',
    'ফুল': 'flower', 'ফুলের': 'flower', 'গোলাপ': 'rose', 'পদ্ম': 'lotus', 'শাপলা': 'water lily', 'গাছ': 'tree', 'গাছের': 'tree', 'বাগান': 'garden', 'বন': 'forest', 'জঙ্গল': 'jungle',
    'বিড়াল': 'cat', 'বিড়াল': 'cat', 'বিড়ালের': 'cat', 'বিড়ালের': 'cat', 'কুকুর': 'dog', 'কুকুরের': 'dog', 'গরু': 'cow', 'গরুর': 'cow', 'ছাগল': 'goat', 'ছাগলের': 'goat', 'মাছ': 'fish', 'ইলিশ': 'hilsa fish', 'বাঘ': 'tiger', 'সিংহ': 'lion', 'ঘোড়া': 'horse', 'ঘোড়া': 'horse', 'হাতি': 'elephant', 'হরিণ': 'deer', 'খরগোশ': 'rabbit', 'প্রজাপতি': 'butterfly', 'বানর': 'monkey', 'ভালুক': 'bear',
    'শরৎ': 'autumn', 'শরতের': 'autumn', 'বর্ষা': 'monsoon rain', 'শীত': 'winter', 'বসন্ত': 'spring',
    'আকাশ': 'sky', 'আকাশের': 'sky', 'আকাশে': 'in the sky', 'মেঘ': 'clouds', 'বরফ': 'snow', 'সমুদ্র': 'ocean', 'সাগর': 'sea', 'সৈকত': 'beach',
    'সকাল': 'morning', 'দুপুর': 'afternoon', 'বিকেল': 'late afternoon', 'সন্ধ্যা': 'evening sunset', 'রাত': 'night', 'রাতের': 'night', 'রাতে': 'at night',
    'বাড়ি': 'house', 'বাড়ি': 'house', 'ঘর': 'room', 'মসজিদ': 'mosque', 'মন্দির': 'temple', 'সেতু': 'bridge', 'ট্রেন': 'train', 'বিমান': 'airplane', 'রিকশা': 'rickshaw', 'সাইকেল': 'bicycle', 'বাইক': 'motorcycle',
    'চা': 'tea', 'কফি': 'coffee', 'খাবার': 'food', 'বই': 'book', 'টেবিল': 'table', 'চেয়ার': 'chair', 'চেয়ার': 'chair',
    'বসে আছে': 'sitting', 'বসে': 'sitting', 'দাঁড়িয়ে আছে': 'standing', 'দাঁড়িয়ে আছে': 'standing', 'দাঁড়িয়ে': 'standing', 'দাঁড়িয়ে': 'standing',
    'উড়ছে': 'flying', 'উড়ছে': 'flying', 'হাঁটছে': 'walking', 'দৌড়াচ্ছে': 'running', 'দৌড়াচ্ছে': 'running', 'খেলছে': 'playing', 'হাসছে': 'smiling', 'পড়ছে': 'reading', 'পড়ছে': 'reading', 'খাচ্ছে': 'eating',
    'ভিজছে': 'in the rain', 'যাচ্ছে': 'going', 'কাছে': 'near', 'ধারে': 'beside', 'পাড়ে': 'on the river bank', 'পাড়ে': 'on the river bank', 'উপরে': 'on top of', 'নিচে': 'under', 'ভিতরে': 'inside', 'মাঝে': 'in the middle of', 'সাথে': 'with', 'হাতে': 'holding in hand'
  };

  // Banglish phonetic dictionary mapping
  const banglishMap: Record<string, string> = {
    'ekta': 'a', 'akta': 'a', 'ekti': 'a', 'ekkhana': 'a', 'ekjon': 'a',
    'shundor': 'beautiful', 'shundar': 'beautiful', 'sundor': 'beautiful', 'sundar': 'beautiful', 'shobcheye': 'most',
    'boro': 'large', 'choto': 'small', 'notun': 'new', 'purono': 'old', 'gorom': 'hot', 'thanda': 'cold',
    'lal': 'red', 'kalo': 'black', 'shada': 'white', 'sada': 'white', 'badami': 'brown',
    'neel': 'blue', 'nil': 'blue', 'shobuj': 'green', 'sobuj': 'green',
    'holud': 'yellow', 'komola': 'orange', 'golapi': 'pink', 'beguni': 'purple', 'dhushor': 'gray', 'shonali': 'golden', 'sonali': 'golden',
    'genji': 't-shirt', 'tshirt': 't-shirt', 'half pant': 'half-pants shorts', 'jama': 'outfit', 'juta': 'shoes', 'choshma': 'glasses', 'tupi': 'cap', 'pore': 'wearing', 'pora': 'wearing', 'ar': 'and', 'ebong': 'and',
    'pakhi': 'bird', 'pakhir': 'bird', 'pakhiro': 'bird', 'murgi': 'chicken', 'murgir': 'chicken', 'morog': 'rooster', 'moroger': 'rooster', 'hash': 'duck', 'hasher': 'duck', 'kobutor': 'pigeon', 'doel': 'magpie robin bird', 'tiya': 'parrot', 'moyur': 'peacock', 'kokil': 'cuckoo bird', 'kak': 'crow',
    'gari': 'car', 'garir': 'car', 'gadi': 'car', 'gadir': 'car', 'rickshaw': 'rickshaw', 'rikshaw': 'rickshaw', 'nouka': 'traditional wooden boat', 'noukar': 'wooden boat', 'jahaj': 'ship', 'biman': 'airplane', 'cycle': 'bicycle',
    'nodi': 'river', 'nodir': 'river', 'nodi-par': 'river bank', 'nodir-par': 'river bank', 'haor': 'wetland lake', 'jhorna': 'waterfall',
    'pahar': 'mountain', 'paharer': 'mountain', 'parbot': 'mountain',
    'meye': 'girl', 'meyer': 'girl', 'mey': 'girl', 'balika': 'young girl', 'mohila': 'woman', 'nari': 'woman', 'bou': 'bride',
    'chele': 'boy', 'cheler': 'boy', 'chhele': 'boy', 'balok': 'young boy', 'purush': 'man', 'lok': 'man', 'bura': 'old man', 'buri': 'old woman', 'krishok': 'farmer', 'daktar': 'doctor',
    'manush': 'person', 'manusher': 'person', 'baccha': 'child', 'shishu': 'child', 'bondhu': 'friends',
    'chand': 'moon', 'chander': 'moon', 'chad': 'moon', 'chader': 'moon', 'jochona': 'moonlight', 'josna': 'moonlight', 'tara': 'stars',
    'shurjo': 'sun', 'surjo': 'sun', 'shurjer': 'sun', 'surjer': 'sun',
    'gram': 'rural village', 'gramer': 'village', 'shohor': 'city', 'sohor': 'city', 'shohorer': 'city', 'dhaka': 'Dhaka city',
    'brishti': 'rain', 'bristi': 'rain', 'brishtir': 'rain', 'bristir': 'rain', 'jhor': 'storm', 'kuyasha': 'misty fog',
    'pukur': 'pond', 'dighi': 'lake',
    'ful': 'flower', 'fuler': 'flower', 'golap': 'rose', 'shapla': 'water lily', 'padma': 'lotus', 'kodom': 'kadamba flower', 'surjomukhi': 'sunflower', 'bagan': 'garden',
    'gach': 'tree', 'gacher': 'tree', 'bon': 'forest', 'boner': 'forest', 'jongol': 'jungle', 'khet': 'crop field', 'dhan': 'paddy field',
    'biral': 'cat', 'biraler': 'cat', 'bilai': 'cat', 'kukur': 'dog', 'kukurer': 'dog', 'goru': 'cow', 'gorur': 'cow', 'chagol': 'goat', 'chagoler': 'goat',
    'mach': 'fish', 'macher': 'fish', 'ilish': 'hilsa fish', 'bagh': 'tiger', 'bagher': 'tiger', 'shingho': 'lion', 'singho': 'lion', 'ghora': 'horse', 'hati': 'elephant', 'horin': 'deer', 'khorgosh': 'rabbit', 'projapoti': 'butterfly', 'shap': 'snake', 'banor': 'monkey', 'bhaluk': 'bear',
    'shorot': 'autumn season', 'shoroter': 'autumn', 'borsha': 'monsoon rainy season', 'shit': 'winter', 'boshonto': 'spring',
    'akash': 'sky', 'akasher': 'sky', 'akashe': 'in the sky', 'megh': 'clouds', 'megher': 'clouds', 'borof': 'snow',
    'sokal': 'morning sunrise', 'shokal': 'morning sunrise', 'dupur': 'sunny afternoon', 'bikel': 'late afternoon', 'shondha': 'golden hour sunset', 'sondha': 'sunset',
    'raat': 'night', 'rat': 'night', 'rater': 'night', 'rate': 'at night', 'rasta': 'road', 'rastar': 'road', 'rastay': 'on the street',
    'somudro': 'ocean sea', 'shomudro': 'ocean sea', 'shagor': 'ocean', 'sagor': 'ocean',
    'bari': 'house', 'barir': 'house', 'ghor': 'room', 'ghore': 'in the room', 'mosjid': 'mosque', 'mondir': 'temple', 'dokan': 'shop', 'dokane': 'at the shop',
    'cha': 'cup of tea', 'chayer': 'tea', 'khabar': 'food', 'boi': 'book', 'chata': 'umbrella', 'shari': 'saree', 'saree': 'saree', 'panjabi': 'traditional panjabi',
    'boshe ache': 'sitting', 'bose ache': 'sitting', 'boshe': 'sitting', 'bose': 'sitting',
    'dariye ache': 'standing', 'dariye': 'standing', 'daraye ache': 'standing', 'daraye': 'standing',
    'urche': 'flying in the sky', 'urtese': 'flying', 'hatche': 'walking', 'haat-tese': 'walking', 'douracche': 'running', 'khelche': 'playing', 'hashche': 'smiling', 'porche': 'reading', 'khacche': 'eating', 'cholche': 'moving',
    'bheja': 'wet drenched', 'bhijche': 'getting wet in rain', 'vijche': 'getting wet in rain',
    'par e': 'on the bank of', 'pare': 'on the bank of', 'upor': 'on top of', 'upore': 'on top of', 'niche': 'underneath',
    'majhe': 'in the middle of', 'moddhe': 'inside', 'vitore': 'inside', 'baire': 'outside', 'pashe': 'beside', 'samne': 'in front of', 'pichone': 'behind', 'sathe': 'with', 'hate': 'in hand',
  };

  // Replace multi-word expressions first
  for (const [k, v] of Object.entries(bengaliScriptMap)) {
    if (k.includes(' ')) {
      text = text.split(k).join(v);
    }
  }
  for (const [k, v] of Object.entries(banglishMap)) {
    if (k.includes(' ')) {
      const reg = new RegExp(`\\b${k}\\b`, 'gi');
      text = text.replace(reg, v);
    }
  }

  // Replace single words
  for (const [k, v] of Object.entries(bengaliScriptMap)) {
    if (!k.includes(' ')) {
      text = text.split(k).join(` ${v} `);
    }
  }
  for (const [k, v] of Object.entries(banglishMap)) {
    if (!k.includes(' ')) {
      const reg = new RegExp(`\\b${k}\\b`, 'gi');
      text = text.replace(reg, v);
    }
  }

  // Clean trailing spaces and leftover grammar
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:a|an)\s+(a|an)\b/i, '$1');
  return text.length > 2 ? text : rawPrompt.trim();
}

// Helper to detect if a prompt contains Banglish, Bengali, or any non-English words requiring translation
export function requiresPromptTranslation(prompt: string, isBengaliHint?: boolean): boolean {
  if (isBengaliHint) return true;
  // Any non-ASCII character (Bengali script, Hindi, Arabic, Cyrillic, CJK, accented European characters, etc.)
  if (/[^\x00-\x7F]/.test(prompt)) return true;

  // Comprehensive Banglish & multilingual transliterated word detector
  const banglishDetector = /\b(?:ekta|akta|ekti|ekkhana|ekjon|kono|kichu|chobi|chobu|chabi|cobi|cabi|sobi|shobi|subi|poto|foto|banao|banan|banat|banate|banaye|baniye|banaya|banaia|banay|banaw|banai|akho|aako|ako|anko|ake|eke|amake|amar|tomar|shundor|shundar|sundor|sundar|boro|choto|notun|purono|gorom|thanda|lal|kalo|shobuj|sobuj|neel|nil|holud|shada|sada|golapi|komola|beguni|shonali|sonali|badami|genji|jama|juta|choshma|tupi|pore|pora|gari|garir|gadi|gadir|pakhi|pakhir|murgi|murgir|morog|moroger|hash|hasher|kobutor|doel|tiya|moyur|kak|nodi|nodir|haor|jhorna|pahar|paharer|chele|cheler|chhele|balok|meye|meyer|balika|mohila|nari|purush|lok|manush|manusher|baccha|shishu|bura|buri|krishok|daktar|bondhu|chand|chander|chad|chader|jochona|josna|shurjo|surjo|shurjer|surjer|tara|gram|gramer|shohor|shohorer|sohor|brishti|bristi|brishtir|bristir|jhor|kuyasha|pukur|dighi|nouka|noukar|jahaj|biman|rickshaw|rikshaw|ful|fuler|golap|shapla|kodom|bagan|gach|gacher|bon|boner|jongol|khet|dhan|biral|biraler|bilai|kukur|kukurer|goru|gorur|chagol|chagoler|mach|macher|ilish|bagh|bagher|shingho|singho|ghora|hati|horin|khorgosh|projapoti|banor|bhaluk|shorot|borsha|shit|boshonto|akash|akasher|akashe|megh|megher|borof|raat|rater|rate|shokal|sokal|dupur|bikel|shondha|sondha|rasta|rastar|rastay|somudro|shomudro|shagor|sagor|bari|barir|ghor|ghore|mosjid|mondir|dokan|dokane|cha|chayer|khabar|boi|chata|shari|panjabi|boshe|bose|dariye|daraye|urche|urtese|hatche|douracche|khelche|hashche|porche|khacche|cholche|ache|chilo|upor|upore|niche|majhe|moddhe|vitore|baire|pashe|samne|pichone|sathe|hate|drissho|drisho|ladka|ladki|peela|laal|neela|hara|khada|tasveer|imagen|dibujo|dessine)\b/i;

  return banglishDetector.test(prompt);
}

// Helper to preserve user prompt fidelity and translate Bengali / Banglish / any language into exact visual English prompts
export async function enrichImagePrompt(rawPrompt: string, style?: string, isBengaliHint?: boolean): Promise<string> {
  const prompt = (rawPrompt || '').trim();
  if (!prompt) return '';

  const needsTranslation = requiresPromptTranslation(prompt, isBengaliHint);

  // If prompt is already clean English without Bengali/Banglish/foreign script, preserve user prompt and details verbatim
  if (!needsTranslation) {
    return applyStyleIfSpecified(prompt, style);
  }

  const systemInstruction =
    'You are a precise multilingual visual translator for an AI image generator.\n' +
    'The user has written an image prompt in Bengali (বাংলা), Banglish (Bengali written in English letters), or another language.\n' +
    'Your ONLY job is to translate the user\'s exact requested image into a clear, literal, descriptive English image prompt.\n' +
    'STRICT MANDATORY RULES:\n' +
    '1. EXACT SUBJECT FIDELITY: Translate the exact subject(s), object(s), person/people, animal(s), bird(s), action(s), colors, clothing, environment, weather, and lighting that the user asked for. NEVER change the subject or substitute it with something else.\n' +
    '2. NO HALLUCINATED SUBJECTS: Do NOT add people if the user did not ask for people. If the user DID ask for a person/girl/boy/man/woman/child/character, include them with the exact attributes requested.\n' +
    '3. STRIP COMMAND WORDS ONLY: Ignore conversational framing like "আমাকে একটা ... ছবি বানিয়ে দাও", "ekta ... chobi banaye deo", or "ekta ... chobi dao" and output ONLY the English description of the visual scene itself.\n' +
    '4. Output ONLY the single English prompt line. No quotes, no markdown, no explanations, no prefixes.';

  const cleanTranslatedOutput = (rawOut: string): string => {
    let translated = (rawOut || '').trim();
    translated = translated.replace(/^(?:Here is the translation:?|Translation:?|Prompt:?|Visual Prompt:?|English Prompt:?|Image Prompt:?)\s*/i, '');
    translated = translated.replace(/^["'`*#]+|["'`*#]+$/g, '').trim();
    if (translated.includes('\n')) {
      const firstLine = translated
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 2 && !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('*'));
      if (firstLine) {
        translated = firstLine.replace(/^["'`>]+|["'`]+$/g, '').trim();
      } else {
        translated = translated.split('\n')[0].replace(/^[-*•>0-9.\s]+/, '').replace(/^["'`]+|["'`]+$/g, '').trim();
      }
    }
    return translated;
  };

  // 1. Primary Fast Translation Engine: Groq LPU (~600ms, immune to Gemini free-tier rate limits)
  const groq = getGroqClient();
  if (groq) {
    const groqModels = [GROQ_MODELS.FALLBACK, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'].filter(Boolean);
    for (const groqModel of groqModels) {
      try {
        const completion = await groq.chat.completions.create({
          model: groqModel,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `Translate this image request into an exact English visual prompt: "${prompt}"` },
          ],
          temperature: 0.1,
          max_tokens: 200,
        });
        const translated = cleanTranslatedOutput(completion.choices?.[0]?.message?.content || '');
        if (translated && translated.length > 2 && !/[\u0980-\u09FF]/.test(translated)) {
          return applyStyleIfSpecified(translated, style);
        }
      } catch (groqErr: any) {
        safeLogger.warn(`[Image Prompt Translation] Groq ${groqModel} note:`, groqErr?.message?.slice(0, 100));
      }
    }
  }

  // 2. Secondary Translation Engine: Gemini
  const gemini = getGeminiClient();
  if (gemini) {
    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    for (const targetModel of candidateModels) {
      try {
        const transRes = await gemini.models.generateContent({
          model: targetModel,
          contents: `Translate this image request into an exact English visual prompt: "${prompt}"`,
          config: {
            systemInstruction,
            temperature: 0.1,
          },
        });

        const translated = cleanTranslatedOutput(transRes.text || '');
        if (translated && translated.length > 2 && !/[\u0980-\u09FF]/.test(translated)) {
          return applyStyleIfSpecified(translated, style);
        }
      } catch (err: any) {
        safeLogger.warn(`[Image Prompt Translation] Gemini ${targetModel} note:`, err?.message?.slice(0, 100));
      }
    }
  }

  // 3. Tertiary Resilient Offline Banglish & Bengali Translation Fallback
  try {
    const offlineTranslated = translateBanglishAndBengaliOffline(prompt);
    if (offlineTranslated && offlineTranslated.length > 2) {
      return applyStyleIfSpecified(offlineTranslated, style);
    }
  } catch (offlineErr: any) {
    safeLogger.warn('Offline translation error:', offlineErr?.message || offlineErr);
  }

  return applyStyleIfSpecified(prompt, style);
}

function applyStyleIfSpecified(prompt: string, style?: string): string {
  const cleanStyle = (style || '').toLowerCase().trim();
  if (!cleanStyle || cleanStyle === 'natural' || cleanStyle === 'none' || cleanStyle === 'standard') {
    return prompt;
  }

  const styleKeywords: Record<string, string> = {
    photorealistic: 'realistic photography, natural lighting',
    realistic: 'realistic photography, natural lighting',
    black_and_white: 'black and white photography, grayscale',
    cinematic: 'cinematic film still, dramatic lighting',
    anime: 'anime style, vibrant art, clean line art',
    cyberpunk: 'cyberpunk style, neon lighting',
    '3d_render': '3D render style, clean volumetric lighting',
    '3d': '3D render style, clean volumetric lighting',
    fantasy: 'fantasy style, atmospheric lighting',
    oil_painting: 'oil painting style, textured brushwork',
    minimalist: 'minimalist style, clean composition',
  };

  const styleEnhancement = styleKeywords[cleanStyle] || `${cleanStyle} style`;
  if (!prompt.toLowerCase().includes(cleanStyle.replace('_', ' ')) && !prompt.toLowerCase().includes(styleEnhancement.toLowerCase())) {
    return `${prompt}, ${styleEnhancement}`;
  }
  return prompt;
}

import { generateGeminiImage, generateAIImages, type GenerateImageOptions, type GenerateImagesOptions } from './image-generator.js';
export { generateGeminiImage, generateAIImages };
export type { GenerateImageOptions, GenerateImagesOptions };
export const generateAIImage = generateGeminiImage;

// Transcribe audio using Whisper API if configured
export async function transcribeAudioFile(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error('Audio file not found on the server.');
  }

  const stat = fs.statSync(filePath);
  if (stat.size < 100) {
    throw new Error('Audio recording is empty or too short. Please speak clearly into your microphone.');
  }
  if (stat.size > 25 * 1024 * 1024) {
    throw new Error('Audio file exceeds maximum size of 25MB for transcription.');
  }

  const groq = getGroqClient();
  if (groq) {
    try {
      const fileStream = fs.createReadStream(filePath);
      const transcription = await groq.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-large-v3',
        response_format: 'text',
      });

      const rawTrans: any = transcription;
      const resultText = typeof rawTrans === 'string' ? rawTrans.trim() : rawTrans?.text?.trim() || '';
      if (resultText) {
        return resultText;
      }
    } catch (err: any) {
      safeLogger.warn('Whisper transcription error:', err?.message || err);
    }
  }

  throw new Error('Voice transcription is temporarily unavailable. Please try again later.');
}

// Memory Extraction using Gemini 2.5 Flash
export async function extractAndSaveMemory(userId: string, conversationId: string, userMessage: string, assistantReply: string): Promise<void> {
  const user = await db.findUserById(userId);
  if (!user || !user.memoryEnabled) return;

  const memoryPrompt = `Analyze this brief user-assistant exchange. Identify if the user explicitly stated any permanent personal facts, preferences, work/project details, or durable instructions about themselves that should be remembered across future sessions.
If YES, output ONLY a clean, concise 1-sentence memory statement and its category (preference | personal | project | general) formatted as JSON: {"content": "...", "category": "..."}.
If NO durable facts or preferences were stated, return {"content": null}.

User message: "${userMessage.slice(0, 500)}"
Assistant reply: "${assistantReply.slice(0, 500)}"`;

  try {
    const gemini = getGeminiClient();
    if (gemini) {
      const res = await gemini.models.generateContent({
        model: GEMINI_MODELS.MAIN,
        contents: memoryPrompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const parsed = JSON.parse(res.text || '{}');
      if (parsed.content && typeof parsed.content === 'string' && parsed.content.length > 5) {
        await db.createMemory({
          userId,
          content: parsed.content.trim(),
          category: parsed.category || 'preference',
        });
      }
    }
  } catch (err) {
    safeLogger.warn('Memory auto-extraction note:', err);
  }
}

// Auto Title Generation using Gemini 2.5 Flash
export async function generateConversationTitle(firstUserMessage: string): Promise<string> {
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const res = await gemini.models.generateContent({
        model: GEMINI_MODELS.MAIN,
        contents: `Generate a concise, smart 3 to 6 word title summarizing the user query: "${firstUserMessage.slice(0, 300)}". Do NOT use quotes, markdown, or punctuation. Output only the title text.`,
        config: {
          temperature: 0.3,
        },
      });

      const title = res.text?.trim();
      if (title && title.length > 2) {
        return title.replace(/^["'`]|["'`]$/g, '').trim();
      }
    } catch (e) {
      safeLogger.warn('Gemini title generation note:', e);
    }
  }

  return 'New Conversation';
}

