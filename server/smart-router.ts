/**
 * Aestific Smart Router
 * 
 * Intelligent, zero-latency heuristic router that categorizes user requests
 * and routes them to the exact optimal AI capability:
 * 
 * ⚡ Gemini 3.1 Flash-Lite  -> Default / Simple tasks
 * 🧠 DeepSeek V4 Flash      -> Coding / Reasoning
 * 🧠 Gemini 3.1 Pro         -> Genuinely hard multi-step tasks
 * 🌐 Exa                    -> Current / Web research
 * 🎨 Google Gemini Image   -> Image generation (gemini-3.1-flash-lite-image)
 * 🚀 Groq                   -> Provider fallback
 * 
 * STRICT DIRECTIVE:
 * Never make unnecessary API calls. Only invoke an external service when
 * genuinely required by the user's explicit query.
 */

import { shouldPerformWebSearch, isExaSearchConfigured } from './exa.js';
import { isDeepSeekConfigured } from './deepseek.js';
import { normalizeAndValidateModel, DEFAULT_MODEL_ID, IMAGE_MODELS } from './models.js';
import { safeLogger } from './error-handler.js';
import { detectImageGenerationIntent } from './image-intent.js';

export type TaskCategory =
  | 'default_simple'     // Everyday conversations, summaries, general Q&A
  | 'coding_reasoning'   // Code writing, debugging, algorithms, technical logic
  | 'hard_reasoning'     // Complex multi-step reasoning, mathematical proofs, system architecture
  | 'web_research'       // Real-time news, current events, live rates, fresh facts
  | 'image_generation';  // Explicit user requests to draw, illustrate, or generate images

export interface SmartRouteAnalysis {
  category: TaskCategory;
  primaryProvider: 'gemini' | 'deepseek' | 'exa' | 'image' | 'groq';
  modelId: string;
  displayName: string;
  reason: string;
  requiresWebSearch: boolean;
  isImageRequest: boolean;
  fallbackChain: string[];
}

// Regex patterns for Coding & Algorithmic Reasoning (Strict to avoid false positives on normal conversation)
const CODING_PATTERNS = [
  /```[\s\S]*?```/, // Contains markdown code block
  // Syntactic declarations and constructs
  /\b(?:const|let|var)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=/i,
  /\b(?:async\s+)?function\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/i,
  /\bdef\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/i,
  /\bclass\s+[A-Z][a-zA-Z0-9_]*\s*(?:extends|implements|\{|\()/i,
  /\bimport\s+.*?\s+from\s+['"][^'"]+['"]/i,
  /\bfrom\s+[a-zA-Z_.]+\s+import\s+/i,
  /\bconsole\.(?:log|error|warn)\s*\(/i,
  /\bprint\s*\(.*?\)/i,
  /\bpublic\s+static\s+void\s+main\b/i,
  /\binterface\s+[A-Z][a-zA-Z0-9_]*\s*\{/i,
  // Coding requests (imperative action + code target)
  /\b(?:write|code|implement|create|build|generate|refactor|optimize)\s+(?:a\s+|an\s+)?(?:[a-zA-Z0-9#+-]+\s+)?(?:script|function|algorithm|implementation|component|hook|endpoint|regex|class|program|method|sql\s+query|api)\b/i,
  /\b(?:write|give\s+me|generate)\s+(?:a\s+|an\s+)?(?:[a-zA-Z0-9#+-]+\s+)?code\b/i,
  // Bug fixing, error traces and debugging
  /\b(?:debug|fix\s+(?:this|my|the)?\s*code|syntax\s*error|runtime\s*error|stack\s*trace|nullpointer|typeerror|cannot\s+read\s+propert(?:y|ies)|undefined\s+is\s+not\s+a\s+function|segmentation\s+fault|indexoutofrange)\b/i,
  /\b(?:error|exception)\s*:\s*[a-zA-Z]/i,
  // Algorithms and LeetCode problems
  /\b(?:binary\s+search|linked\s+list|binary\s+tree|depth-first\s+search|breadth-first\s+search|quicksort|mergesort|dijkstra|dynamic\s+programming|leetcode|time\s+complexity|big\s*o\s+complexity)\b/i,
  // Specific SQL statements
  /\b(?:select\s+[\s\S]*\s+from|insert\s+into\s+[\s\S]*values|update\s+[\s\S]*set|delete\s+from)\b/i,
  // Package manager commands
  /\b(?:npm|pnpm|yarn|cargo|pip|docker|docker-compose|kubectl)\s+(?:install|run|build|test|add|compose|apply)\b/i,
  /\bgit\s+(?:commit|rebase|merge|push|pull|checkout|cherry-pick)\b/i,
  // Bengali / Banglish coding terms
  /(?:কোড\s*(?:লিখ|কর|দাও)|প্রোগ্রামিং\s*(?:কর|কোড)|ডিবাগ|অ্যালগরিদম\s*(?:ইমপ্লিমেন্ট|কোড)|বাগ\s*ফিক্স|কোডিং\s*সমস্যা)/i,
  /\b(?:code\s*likhe\s*dao|error\s*ashtese|function\s*likho|code\s*kore\s*dao)\b/i,
];

// Conceptual explanations that shouldn't be falsely classified as coding tasks
const CONCEPTUAL_EXPLANATION_PATTERN =
  /^(?:explain|what\s+is|define|meaning\s+of|tell\s+me\s+about)\s+(?:what\s+is\s+)?(?:a\s+|an\s+|the\s+)?(?:[a-zA-Z0-9#+-]+\s+)?(?:function|class|variable|loop|recursion|method|concept|syntax|keyword|programming\s+language|statement|module)\b/i;

const EXPLICIT_CODE_ACTION_PATTERN =
  /\b(?:write|code|implement|create|debug|fix|provide\s+code|give\s+me\s+code|run|binary\s+search|quicksort|cannot\s+read\s+propert|error|stack\s*trace)\b/i;

// Regex patterns for Genuinely Hard Tasks (Advanced STEM, formal proofs, complex system architecture)
const HARD_TASK_PATTERNS = [
  /\b(?:formal\s+proof|mathematical\s+proof|prove\s+that|proof\s+by\s+contradiction|theorem|lemma|axiom|mathematical\s+derivation|formal\s+verification)\b/i,
  /\b(?:differential\s+equations|fourier\s+transform|eigenvalues|tensor\s+calculus|abstract\s+algebra|topology|manifold|riemann|schrodinger|navier-stokes)\b/i,
  /\b(?:distributed\s+consensus|raft\s+consensus|paxos|byzantine\s+fault|distributed\s+transactions|two-phase\s+commit|cap\s+theorem|sharding\s+architecture\s+for\s+billions)\b/i,
  /\b(?:zero-knowledge\s+proofs?|zk-snark|zk-stark|elliptic\s+curve\s+cryptography|homomorphic\s+encryption|cryptographic\s+security\s+analysis|lattice-based\s+cryptography)\b/i,
  /\b(?:multi-step\s+logic\s+puzzle|complex\s+game\s+theory\s+proof|formal\s+deductive\s+reasoning)\b/i,
  /(?:জটিল\s*গাণিতিক\s*প্রমাণ|সিস্টেম\s*আর্কিটেকচার\s*ডিজাইন|থিওরেম\s*প্রমাণ|গাণিতিক\s*ডেরিভেশন)/i,
];

// Regex patterns for Image Creation Requests
const IMAGE_REQUEST_PATTERNS = [
  /^\/(?:image|img|picture|photo|draw)\s+(.+)$/i,
  /^(?:please\s+)?(?:can\s+you\s+)?(?:give|show|send|draw|paint|sketch|illustrate)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|artwork|painting|illustration|photo|photograph|wallpaper)?\s*(?:of|showing|depicting|with)?\s*(.+)/i,
  /^(?:please\s+)?(?:can\s+you\s+)?(?:generate|create|render|produce|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|wallpaper|artwork|portrait|illustration|drawing|avatar|banner|logo|render)\b/i,
  /\b(?:generate|create|draw|paint|render)\s+(?:an?\s+)?(?:image|picture|photo|artwork|illustration|avatar|drawing)\s+of\b/i,
  /^(?:i\s+want|i\s+need|i\'d\s+like)\s+(?:an?\s+)?(?:image|picture|photo|artwork|drawing|illustration|wallpaper)\s+(?:of|showing|depicting|with)?\s*(.+)/i,
  // Direct visual scene creation (e.g., "Generate a beautiful sunset over a river.", "Create an anime-style girl...")
  /^(?:generate|create|render|produce)\s+(?:an?\s+)?(?:beautiful\s+|futuristic\s+|scenic\s+|stunning\s+|serene\s+|vibrant\s+|cozy\s+|cyberpunk\s+|anime(?:-style)?\s+|realistic\s+|3d\s+)?(?:sunset|sunrise|landscape|scenery|city|cityscape|skyline|portrait|character|girl|boy|person|cat|dog|animal|mountain|river|lake|forest|ocean|sea|beach|space|galaxy|cyberpunk|car|vehicle|flower|house|building|castle|scene)\b/i,
  // Bengali script patterns
  /(?:ছবি|চিত্র|পিকচার|ড্রয়িং|ফটো|ইমেজ|ওয়ালপেপার)\s*(?:বানাও|বানান|বানিয়ে\s*দাও|বানিয়ে\s*দিন|তৈরি\s*করো|এঁকে\s*দাও|এঁকে\s*দিন|আঁকো|আঁকুন|দাও|দিন|দেখাও|চাই|লাগবে|দরকার)/i,
  /(?:একটি|একটা|একখানা)\s+.*(?:ছবি|চিত্র|পিকচার|ফটো)\s*(?:বানাও|বানান|আঁকো|দিন|দাও|চাই|দেখাও)?/i,
  // Banglish patterns
  /\b(?:chobi|chabi|sobi|picture|pic|photo|image|drawing)\s*(?:dite|dao|deo|den|de|dekhao|dakhaw|banao|banan|banaye\s*dao|baniye\s*dao|banay\s*dao|akho|aako|draw\s*koro|generate\s*koro|make\s*koro|chai|chaisi|lagbe|dorkar)\b/i,
  /\b(?:ekta|akta|amake)\s+.*(?:chobi|chabi|sobi|picture|pic|photo)\s*(?:dao|dite|banao|banan|chai|lagbe)?\b/i,
  /\b(?:er\s+chobi|er\s+pic|er\s+photo|er\s+picture)\b/i,
];

/**
 * Classifies a user request and selects the optimal provider according to
 * the Aestific Master Architecture.
 */
export function analyzeAndRouteRequest(
  userQuery: string,
  options: {
    hasMediaAttachments?: boolean;
    explicitModelPreference?: string;
  } = {}
): SmartRouteAnalysis {
  const query = (userQuery || '').trim();
  const { hasMediaAttachments = false, explicitModelPreference } = options;

  // 1. Detect Image Generation Intent
  const imageIntent = detectImageGenerationIntent(query);
  if (imageIntent.isImage) {
    return {
      category: 'image_generation',
      primaryProvider: 'image',
      modelId: IMAGE_MODELS.DEFAULT,
      displayName: 'Aestific Visual',
      reason: 'User explicitly requested image/visual artwork generation.',
      requiresWebSearch: false,
      isImageRequest: true,
      fallbackChain: [IMAGE_MODELS.HIGH_QUALITY, 'pollinations-ai'],
    };
  }

  // 2. Detect Live Web Research Intent (Only if Exa is configured and genuinely needed)
  const needsWebSearch = isExaSearchConfigured() && shouldPerformWebSearch(query, hasMediaAttachments);
  if (needsWebSearch) {
    const chosenModel = (explicitModelPreference && explicitModelPreference !== 'default' && explicitModelPreference !== 'auto')
      ? normalizeAndValidateModel(explicitModelPreference)
      : 'gemini-3.1-flash-lite';
    return {
      category: 'web_research',
      primaryProvider: 'exa',
      modelId: chosenModel,
      displayName: 'Aestific Live Search',
      reason: 'Request asks for current news, live facts, or real-time information.',
      requiresWebSearch: true,
      isImageRequest: false,
      fallbackChain: ['gemini-3.1-flash-lite', 'groq'],
    };
  }

  // 3. User Explicit Model Selection (Validated & Normalized against server registry)
  if (explicitModelPreference && explicitModelPreference !== 'default' && explicitModelPreference !== 'auto') {
    const validatedModel = normalizeAndValidateModel(explicitModelPreference);
    if (validatedModel === 'deepseek-v4-flash') {
      return {
        category: 'coding_reasoning',
        primaryProvider: isDeepSeekConfigured() ? 'deepseek' : 'gemini',
        modelId: 'deepseek-v4-flash',
        displayName: 'Aestific Reason',
        reason: 'User explicitly selected coding reasoning model.',
        requiresWebSearch: false,
        isImageRequest: false,
        fallbackChain: ['gemini-3.1-flash-lite', 'groq'],
      };
    }

    if (validatedModel === 'gemini-3.1-pro-preview') {
      return {
        category: 'hard_reasoning',
        primaryProvider: 'gemini',
        modelId: 'gemini-3.1-pro-preview',
        displayName: 'Aestific Ultra',
        reason: 'User explicitly selected ultra reasoning model.',
        requiresWebSearch: false,
        isImageRequest: false,
        fallbackChain: ['gemini-3.1-flash-lite', 'groq'],
      };
    }

    if (validatedModel === 'gemini-3.1-flash-lite') {
      return {
        category: 'default_simple',
        primaryProvider: 'gemini',
        modelId: 'gemini-3.1-flash-lite',
        displayName: 'Aestific Core',
        reason: 'User explicitly selected default core model.',
        requiresWebSearch: false,
        isImageRequest: false,
        fallbackChain: ['gemini-3.1-flash-lite', 'groq'],
      };
    }
  }

  // 4. Detect Coding & Algorithmic Reasoning Intent
  let isCodingTask = CODING_PATTERNS.some((p) => p.test(query));
  if (isCodingTask) {
    const isPureConceptual =
      CONCEPTUAL_EXPLANATION_PATTERN.test(query) &&
      !EXPLICIT_CODE_ACTION_PATTERN.test(query) &&
      !/```/.test(query);
    if (isPureConceptual) {
      isCodingTask = false;
    }
  }

  if (isCodingTask) {
    const deepSeekAvailable = isDeepSeekConfigured();
    return {
      category: 'coding_reasoning',
      primaryProvider: deepSeekAvailable ? 'deepseek' : 'gemini',
      modelId: 'deepseek-v4-flash',
      displayName: 'Aestific Reason',
      reason: 'Detected programming syntax, algorithm, debugging, or technical development request.',
      requiresWebSearch: false,
      isImageRequest: false,
      fallbackChain: ['gemini-3.1-flash-lite', 'groq'],
    };
  }

  // 5. Detect Genuinely Hard Tasks (Heavy STEM, formal logic, multi-step proofs)
  // Strictly pattern-based — raw input length alone NEVER triggers Gemini Pro
  const isHardTask = HARD_TASK_PATTERNS.some((p) => p.test(query));
  if (isHardTask) {
    return {
      category: 'hard_reasoning',
      primaryProvider: 'gemini',
      modelId: 'gemini-3.1-pro-preview',
      displayName: 'Aestific Ultra',
      reason: 'Detected complex multi-step reasoning, mathematical proof, or system architecture task.',
      requiresWebSearch: false,
      isImageRequest: false,
      fallbackChain: ['gemini-3.1-flash-lite', 'groq'],
    };
  }

  // 6. Default / Simple Tasks -> Aestific Core
  // Standard conversation, translation, writing, summaries, Q&A, greetings, general essays
  return {
    category: 'default_simple',
    primaryProvider: 'gemini',
    modelId: 'gemini-3.1-flash-lite',
    displayName: 'Aestific Core',
    reason: 'Standard conversational request routed to high-speed, cost-efficient default model.',
    requiresWebSearch: false,
    isImageRequest: false,
    fallbackChain: ['gemini-3.1-flash-lite', 'groq'],
  };
}
