/**
 * Aestific Image Intent Detection & Parameter Extraction Engine
 * 
 * Accurately detects when the user wants to generate an image, extracts parameters
 * (quantity, variations, aspect ratio, style, constraints), while strictly preserving
 * the full prompt details without destructive rewriting.
 */

export interface DetectedImageRequest {
  isImage: boolean;
  prompt: string;
  originalPrompt: string;
  quantity: number;
  variations: boolean;
  style: string;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  isBengali: boolean;
}

// Word-to-number mapping for quantities
const NUMBER_WORDS: Record<string, number> = {
  '1': 1,
  'one': 1,
  'a single': 1,
  'single': 1,
  'ek': 1,
  'ekta': 1,
  'akta': 1,
  '১': 1,
  'এক': 1,
  '2': 2,
  'two': 2,
  'couple': 2,
  'a couple of': 2,
  'pair': 2,
  'dui': 2,
  'duita': 2,
  '২': 2,
  'দুই': 2,
  '3': 3,
  'three': 3,
  'tin': 3,
  'tinta': 3,
  '৩': 3,
  'তিন': 3,
  '4': 4,
  'four': 4,
  'char': 4,
  'charta': 4,
  '৪': 4,
  'চার': 4,
  '5': 4, // Clamped to 4
  'five': 4,
  '6': 4,
  'six': 4,
  '8': 4,
  'eight': 4,
};

/**
 * Checks whether the input query is purely an informational, explanatory,
 * programming, or conversational question that should NOT trigger image generation.
 */
export function isNegativeQuery(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // Slash commands always bypass negative query filter
  if (/^\/(?:image|img|picture|photo|draw)\s+/i.test(trimmed)) {
    return false;
  }

  // 1. Coding, scripts, technical requests
  // e.g. "Write python code to generate an image", "javascript function to display images", "CSS for image border"
  const isCodingRequest = /\b(?:code|python|javascript|typescript|js|ts|html|css|sql|script|function|algorithm|class|method|component|library|package|api|regex|sdk|endpoint)\b/i.test(trimmed) &&
    /\b(?:write|create|implement|give\s+me|generate|show|explain|build|develop)\b/i.test(trimmed) &&
    !/^\/(?:image|draw)/i.test(trimmed);
  if (isCodingRequest) return true;

  // 2. Explanations, technical "how do / how does / what is / why does"
  // e.g. "Can you explain how diffusion models generate an image?", "How do cameras work?", "What is stable diffusion?", "How do I draw a cat?"
  const isExplanationOrQuestion = /^(?:can\s+you\s+)?(?:explain|tell\s+me\s+about|describe\s+how|what\s+is|what\s+are|why\s+do|why\s+does|how\s+do|how\s+does|how\s+can\s+one|how\s+to|who\s+is|who\s+are|when\s+was|where\s+is|which|history\s+of)\b/i.test(trimmed) ||
    /\b(?:how\s+(?:diffusion|generative|ai|neural|models?|cameras?|sensors?|lenses?)\s+(?:works?|functions?|generates?))\b/i.test(trimmed) ||
    /\b(?:how\s+do\s+i|how\s+can\s+i|how\s+to)\b/i.test(trimmed);
  if (isExplanationOrQuestion) return true;

  // 3. Text composition / writing / non-visual creation tasks
  // e.g. "Can you write an essay about mountains?", "Write a poem about a sunset", "Make a list of...", "Generate 10 startup ideas"
  const isWritingOrPlanningTask = /^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:write|compose|draft|author|craft|generate|create|make|give\s+me)\s+(?:an?\s+|the\s+|(?:\d+|some|a\s+few|several)\s+)?(?:[\w-]+\s+){0,3}(?:essay|article|poem|poetry|song|lyrics|story|stories|paragraph|report|summary|email|letter|critique|review|speech|dialogue|script|code|plan|workout|meal\s+plan|recipe|resume|cv|cover\s+letter|quiz|test|questions?|ideas?|names?|topics?|suggestions?|examples?|tips?|list|lists|table|spreadsheet|password)\b/i.test(trimmed);
  if (isWritingOrPlanningTask) return true;

  // 4. Meta inquiries about Aestific / troubleshooting
  // e.g. "why did image generation fail", "how does your image generator work"
  const isMetaQuestion = /\b(?:why\s+did|why\s+does|karon\s*ki|somossa\s*ki|jhamela\s*kore\s*ken)\b/i.test(trimmed) &&
    /\b(?:fail|error|not\s+working)\b/i.test(trimmed);
  if (isMetaQuestion) return true;

  // 5. Conversational greetings and general questions
  const isGeneralChat = /^(?:hi|hello|hey|good\s+morning|good\s+afternoon|good\s+evening|how\s+are\s+you|thank\s+you|thanks|help|who\s+are\s+you)\b/i.test(trimmed);
  if (isGeneralChat) return true;

  return false;
}

/**
 * Extracts quantity and variations intent from the query.
 * e.g. "generate 4 different versions of a futuristic city" -> quantity: 4, variations: true
 */
export function extractQuantityAndVariations(text: string): { quantity: number; variations: boolean } {
  let quantity = 1;
  let variations = false;

  // Check for variations keywords
  if (/\b(?:different\s+versions?|variations?|different\s+styles?|multiple\s+options?|multiple\s+versions?|distinct\s+versions?|alternate\s+versions?|different\s+angles?)\b/i.test(text)) {
    variations = true;
    quantity = 4; // Default to 4 variations if not explicitly numbered
  }

  // Look for explicit number patterns:
  // e.g. "4 different versions", "4 images", "3 pictures", "generate 2 variations", "generate 4 futuristic cyberpunk cities"
  const qtyPatterns = [
    /\b(?:generate|create|make|draw|give|produce|render|visualize)\s+(\d+|one|two|three|four|five|six|eight|a\s+couple\s+of|a\s+few)\s+(?:different\s+)?(?:images?|pictures?|photos?|photographs?|illustrations?|drawings?|artworks?|paintings?|versions?|variations?|options?|renders?)\b/i,
    /\b(?:generate|create|make|draw|give|produce|render|visualize)\s+(\d+|one|two|three|four|five|six|eight)\b/i,
    /\b(\d+|one|two|three|four|five|six|eight)\s+(?:different\s+)?(?:images?|pictures?|photos?|photographs?|illustrations?|drawings?|artworks?|paintings?|versions?|variations?|options?|renders?)\b/i,
    // Bengali: "৪টি ছবি", "৪টা ভিন্ন ছবি", "চারটি ছবি"
    /(?:(\d+|চার|তিন|দুই|এক|৪|৩|২|১|char|tin|dui|ekta|akta|duita|tinta|charta))\s*(?:টি|টা|ti|ta)?\s*(?:ভিন্ন\s*)?(?:ছবি|চিত্র|পিকচার|ফটো|chobi|chabi|sobi)/i,
  ];

  for (const pat of qtyPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const token = match[1].toLowerCase().trim();
      const num = NUMBER_WORDS[token] ?? parseInt(token, 10);
      if (!isNaN(num) && num >= 1) {
        quantity = Math.min(Math.max(num, 1), 4);
        if (num > 1) {
          variations = true;
        }
        break;
      }
    }
  }

  return { quantity, variations };
}

/**
 * Extracts requested aspect ratio.
 */
export function extractAspectRatio(text: string): '1:1' | '16:9' | '9:16' | '4:3' | '3:4' {
  const lower = text.toLowerCase();

  // 1. Explicit square
  if (/\b(?:square|1:1|1x1|1\/1|equal\s+sides)\b/i.test(lower)) {
    return '1:1';
  }

  // 2. Landscape / Widescreen / 16:9
  if (/\b(?:16:9|16\/9|16x9|landscape|widescreen|wide\s+screen|horizontal|desktop\s+wallpaper|banner)\b/i.test(lower)) {
    return '16:9';
  }

  // 3. Portrait / Vertical / 9:16 (mobile screen / story / reel)
  if (/\b(?:9:16|9\/16|9x16|phone\s+wallpaper|mobile\s+wallpaper|story|reel|vertical)\b/i.test(lower)) {
    return '9:16';
  }

  // 4. Classic 4:3
  if (/\b(?:4:3|4\/3|4x3)\b/i.test(lower)) {
    return '4:3';
  }

  // 5. Vertical 3:4
  if (/\b(?:3:4|3\/4|3x4)\b/i.test(lower)) {
    return '3:4';
  }

  // 6. Generic portrait keyword without "square":
  // e.g. "portrait photo" vs "square portrait"
  if (/\bportrait\b/i.test(lower) && !/\bsquare\b/i.test(lower) && !/\b(?:portrait\s+of|face\s+portrait)\b/i.test(lower)) {
    return '3:4';
  }

  return '1:1';
}

/**
 * Extracts requested visual style.
 */
export function extractStyle(text: string): string {
  const lower = text.toLowerCase();

  if (/\b(?:black\s*and\s*white|black-and-white|b&w|monochrome|grayscale|noir)\b/i.test(lower)) {
    return 'black_and_white';
  }
  if (/\b(?:cinematic\s+poster|movie\s+poster|cinematic|film\s+still|dramatic\s+lighting)\b/i.test(lower)) {
    return 'cinematic';
  }
  if (/\b(?:photorealistic|realistic\s+photo|realistic\s+photograph|photograph|photo\s+of|real\s+life\s+photo|hyperrealistic)\b/i.test(lower)) {
    return 'photorealistic';
  }
  if (/\b(?:anime|manga|anime-style|otaku|studio\s+ghibli)\b/i.test(lower)) {
    return 'anime';
  }
  if (/\b(?:cyberpunk|neon|synthwave|futuristic\s+city|sci-fi)\b/i.test(lower)) {
    return 'cyberpunk';
  }
  if (/\b(?:3d|3d\s*render|cgi|octane|unreal\s*engine|pixar)\b/i.test(lower)) {
    return '3d_render';
  }
  if (/\b(?:fantasy|mythical|magical|dragon|medieval|ethereal)\b/i.test(lower)) {
    return 'fantasy';
  }
  if (/\b(?:minimalist|minimal|vector|flat\s*art|clean\s*lines|logo)\b/i.test(lower)) {
    return 'minimalist';
  }
  if (/\b(?:oil\s*painting|classical\s*painting|acrylic|watercolor)\b/i.test(lower)) {
    return 'oil_painting';
  }

  return 'natural';
}

/**
 * Cleans conversational framing from the prompt to yield the pure visual prompt,
 * while strictly preserving every single descriptive element, object, style, constraint,
 * lighting, and modifier.
 */
export function preserveAndCleanPrompt(rawText: string): string {
  let cleaned = rawText.trim();

  // Strip slash commands: /image, /draw, /photo, etc.
  cleaned = cleaned.replace(/^\/(?:image|img|picture|photo|draw)\s+/i, '');

  // Strip leading conversational wrapper e.g. "Can you please generate an image of..."
  cleaned = cleaned.replace(
    /^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:would\s+you\s+)?(?:i\s+want\s+you\s+to\s+)?(?:i\'d\s+like\s+you\s+to\s+)?(?:generate|create|make|produce|render|draw|paint|sketch|illustrate|visualize|give\s+me|show\s+me|send\s+me)\s+(?:me\s+)?/i,
    ''
  );

  // Strip quantity phrase if present at the start of the remainder
  // e.g. "4 different versions of a futuristic city" -> "a futuristic city"
  cleaned = cleaned.replace(
    /^(?:an?\s+)?(?:\d+|one|two|three|four|five|six|eight|a\s+couple\s+of|a\s+few)\s+(?:different\s+)?(?:versions?|variations?|options?|images?|pictures?|photos?|photographs?|illustrations?|drawings?|artworks?|paintings?|renders?)\s+(?:of|showing|depicting|with\s+)?/i,
    ''
  );

  // Strip standard "an image of", "a photo of", "a picture of" if at the very start
  // BUT preserve if followed by "a cinematic poster with these exact elements: ..."
  cleaned = cleaned.replace(
    /^(?:an?\s+)?(?:image|picture|photo|photograph|drawing|illustration|artwork|visual)\s+(?:of|showing|depicting)\s+/i,
    ''
  );

  // Strip trailing "image", "picture", "photo" if preceded by a descriptor (e.g. "a sunset image" -> "a sunset")
  cleaned = cleaned.replace(/\s+(?:images?|pictures?|photos?|photographs?|wallpapers?)\s*$/i, '');

  // Trim trailing punctuation (., !, ?, Bengali dari ।) and whitespace
  cleaned = cleaned.replace(/[\.!?\u0964\s]+$/, '').trim();

  // Strip Banglish request wrappers e.g. "ekta chobi banao", "chobu banat", "chobi banaye dao", "er chobi banao", "amake ekta chobi dao"
  cleaned = cleaned.replace(
    /\b(?:er\s+)?(?:chobi|chobu|chabi|cobi|cabi|sobi|shobi|subi|chobita|chobiti|sobita|pic|pik|picture|pikchar|pcture|photo|poto|foto|photota|image|imej|imaj|drawing|portrait|portret|illustration)\s+(?:banao|banaw|banan|banat|banate|banai\s+dao|banai\s+deo|banai\s+de|banaye\s+dao|banaye\s+deo|banaye\s+de|banaye\s+dey|baniye\s+dao|baniye\s+deo|baniye\s+de|banaya\s+dao|banaya\s+de|banaia\s+dao|banaia\s+de|banay\s+daw|banay\s+dao|banay\s+de|banay\s+deo|toiri\s+koro|toiri\s+kore\s+dao|toiri\s+kore\s+deo|toiri\s+kore\s+de|akho|aako|ako|anko|ake\s+dao|eke\s+dao|ake\s+de|eke\s+de|draw\s+koro|make\s+koro|generate\s+koro|genarate\s+koro|create\s+koro|dao|deo|daw|den|de|dekhao|dakhaw|dakhao|dekhaw|dikhaw|chai|chaisi|lagbe|dorkar)\b/gi,
    ''
  );
  cleaned = cleaned.replace(
    /\b(?:banao|banaw|banan|banat|banate|banai\s+dao|banai\s+deo|banai\s+de|banaye\s+dao|banaye\s+deo|banaye\s+de|baniye\s+dao|baniye\s+deo|baniye\s+de|banaya\s+dao|banaya\s+de|banaia\s+dao|banaia\s+de|banay\s+daw|banay\s+dao|banay\s+de|banay\s+deo|toiri\s+koro|toiri\s+kore\s+dao|toiri\s+kore\s+deo|toiri\s+kore\s+de|akho|aako|ako|anko|ake\s+dao|eke\s+dao|ake\s+de|eke\s+de|draw\s+koro|make\s+koro|generate\s+koro|genarate\s+koro|create\s+koro|dekhao|dakhaw|dakhao|dekhaw|dikhaw)\s+(?:ekta\s+|akta\s+|ekti\s+)?(?:chobi|chobu|chabi|cobi|cabi|sobi|shobi|subi|chobita|pic|pik|picture|photo|poto|foto|image|imej|imaj)?\b/gi,
    ''
  );
  cleaned = cleaned.replace(
    /^(?:amake\s+|amar\s+jonno\s+)?(?:please\s+|plz\s+)?(?:doya\s+kore\s+)?(?:ekta|akta|ekti|ekkhana)\s+/i,
    ''
  );
  // If prompt ended with "<noun>er chobi" or "<noun> er chobi", strip trailing "er chobi"
  cleaned = cleaned.replace(/\b([a-z]{3,})er\s+(?:chobi|chobu|chabi|cobi|cabi|sobi|shobi|subi|pic|pik|picture|photo|poto|foto|image|imej|imaj)\s*$/gi, '$1');
  cleaned = cleaned.replace(/\b(?:er\s+)?(?:chobi|chobu|chabi|cobi|cabi|sobi|shobi|subi|chobita|chobiti|sobita|pic|pik|picture|photo|poto|foto|image|imej|imaj)\s*$/gi, '');
  cleaned = cleaned.replace(/\b(?:banao|banaw|banan|banat|banate|banai\s+dao|banai\s+deo|banai\s+de|banaye\s+dao|banaye\s+deo|banaye\s+de|baniye\s+dao|baniye\s+deo|baniye\s+de|banaya\s+dao|banaya\s+de|banaia\s+dao|banaia\s+de|banay\s+daw|banay\s+dao|banay\s+de|banay\s+deo|toiri\s+koro|toiri\s+kore\s+dao|toiri\s+kore\s+deo|toiri\s+kore\s+de|akho|aako|ako|anko|ake\s+dao|eke\s+dao|ake\s+de|eke\s+de|dekhao|dakhaw|dakhao|dekhaw|dikhaw)\s*$/gi, '');

  // Strip Bengali request wrappers e.g. "এর ছবি বানাও", "একটা ছবি বানাও", "বানিয়ে দাও"
  cleaned = cleaned.replace(/(?:\s+এর)?\s*(?:ছবি|ছবু|ছবিটা|ছবিটি|চিত্র|পিকচার|পিক|ফটো|ফটোটা|ইমেজ|ইমেজটা|ড্রয়িং|ড্রইং|পেত্রইং|দৃশ্য)\s*(?:বানাও|বানান|বানাতে|বানিয়ে\s*দাও|বানিয়ে\s*দিন|বানিয়ে\s*দেও|বানিয়ে\s*দে|বানাইয়া\s*দাও|বানাইয়া\s*দাও|বানাই\s*দাও|বানাই\s*দেও|বানাই\s*দে|বানায়া\s*দাও|বানায়\s*দাও|বানায়\s*দে|এঁকে\s*দাও|এঁকে\s*দেও|এঁকে\s*দে|এঁকে\s*দিন|তৈরি\s*করো|তৈরী\s*করো|তৈরি\s*করে\s*দাও|তৈরী\s*করে\s*দাও|তৈরি\s*করে\s*দেও|তৈরি\s*করে\s*দে|জেনারেট\s*করো|জেনারেট\s*করে\s*দাও|জেনারেট\s*করে\s*দেও|আঁকো|আঁকুন|আঁক|দাও|দেও|দে|দিন|দেখাও|চাই|লাগবে)[\s\u0964\.]*$/i, '');
  cleaned = cleaned.replace(/\s*(?:বানাও|বানান|বানিয়ে\s*দাও|বানিয়ে\s*দিন|বানিয়ে\s*দেও|বানিয়ে\s*দে|বানাইয়া\s*দাও|বানাইয়া\s*দাও|বানাই\s*দাও|বানাই\s*দেও|বানাই\s*দে|বানায়া\s*দাও|বানায়\s*দাও|বানায়\s*দে|এঁকে\s*দাও|এঁকে\s*দেও|এঁকে\s*দে|এঁকে\s*দিন|তৈরি\s*করে\s*দাও|তৈরী\s*করে\s*দাও|তৈরি\s*করে\s*দেও|তৈরি\s*করে\s*দে|জেনারেট\s*করে\s*দাও|জেনারেট\s*করে\s*দেও|আঁকো|আঁকুন|আঁক)[\s\u0964\.]*$/i, '');
  cleaned = cleaned.replace(/^(?:আমাকে\s*|আমার\s*জন্য\s*)?(?:দয়া\s*করে\s*|প্লিজ\s*)?(?:একটি|একটা|একখানা)\s*/i, '');
  cleaned = cleaned.replace(/\s+(?:এর\s*)?(?:ছবি|ছবু|ছবিটা|ছবিটি|চিত্র|পিকচার|পিক|ফটো|ফটোটা|ইমেজ|ইমেজটা)[\s\u0964\.]*$/i, '');
  cleaned = cleaned.replace(/\s+এর[\s\u0964\.]*$/i, '');
  cleaned = cleaned.replace(/[\.!?\u0964\s]+$/, '').trim();

  // If cleaning resulted in an empty string, fallback to original
  return cleaned.length >= 2 ? cleaned : rawText.trim();
}

/**
 * Primary Intent Detection Function
 */
export function detectImageGenerationIntent(input: string): DetectedImageRequest {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return {
      isImage: false,
      prompt: '',
      originalPrompt: '',
      quantity: 1,
      variations: false,
      style: 'natural',
      aspectRatio: '1:1',
      isBengali: false,
    };
  }

  const isBengali = /[\u0980-\u09FF]/.test(trimmed) || 
    /\b(?:chobi|chobu|chabi|cobi|cabi|sobi|shobi|subi|banao|banaw|banat|banate|banai|banay|banaye|baniye|banaya|banaia|toiri|toyri|akho|aako|ako|anko|amake|dao|deo|daw|dite|den|de|chai|lagbe|ekta|akta|chele|meye|holud|lal|nil|sobuj|kalo|sada|dariye|bose)\b/i.test(trimmed);

  // 1. Explicit Slash Commands
  const slashMatch = trimmed.match(/^\/(?:image|img|picture|photo|draw)\s+(.+)$/is);
  if (slashMatch && slashMatch[1].trim()) {
    const rawSubject = slashMatch[1].trim();
    const { quantity, variations } = extractQuantityAndVariations(rawSubject);
    const aspectRatio = extractAspectRatio(rawSubject);
    const style = extractStyle(rawSubject);
    const prompt = preserveAndCleanPrompt(rawSubject);

    return {
      isImage: true,
      prompt,
      originalPrompt: trimmed,
      quantity,
      variations,
      style,
      aspectRatio,
      isBengali,
    };
  }

  // 2. Negative Query Check: Filter out programming, explanation questions, meta-questions, text composition
  if (isNegativeQuery(trimmed)) {
    return {
      isImage: false,
      prompt: '',
      originalPrompt: trimmed,
      quantity: 1,
      variations: false,
      style: 'natural',
      aspectRatio: '1:1',
      isBengali,
    };
  }

  const { quantity, variations } = extractQuantityAndVariations(trimmed);
  const aspectRatio = extractAspectRatio(trimmed);
  const style = extractStyle(trimmed);

  // 3. Bengali Script Intent Detection
  if (/[\u0980-\u09FF]/.test(trimmed)) {
    const isBengaliTextTask = /(?:কবিতা|গল্প|রচনা|চিঠি|দরখাস্ত|প্রবন্ধ|অনুচ্ছেদ|প্যারাগ্রাফ|সারাংশ|কোড|প্রোগ্রাম|তালিকা|লিস্ট|গান|স্ক্রিপ্ট|ইমেইল|মেসেজ|প্রশ্ন|উত্তর|ব্যাখ্যা|কী|কেন|কীভাবে|কিভাবে|কাকে\s*বলে|বলতে\s*কী)/.test(trimmed);
    const hasBengaliImg = /(?:ছবি|ছবু|ছবিটা|ছবিটি|চিত্র|পিকচার|পিক|ড্রয়িং|ড্রইং|ফটো|ফটোটা|ইমেজ|ইমেজটা|ওয়ালপেপার|প্রতিকৃতি|দৃশ্য|পোস্টার|লোগো|ব্যানার|পেইন্টিং|স্কেচ|আর্ট)/.test(trimmed);
    const hasBengaliDrawingVerb = /(?:আঁকো|আঁকুন|আঁক|এঁকে\s*দাও|এঁকে\s*দেও|এঁকে\s*দে|এঁকে\s*দিন|পেইন্ট\s*করো)/.test(trimmed);
    const hasBengaliMakeVerb = /(?:বানিয়ে\s*দাও|বানিয়ে\s*দেও|বানিয়ে\s*দিন|বানিয়ে\s*দে|বানাইয়া\s*দাও|বানাইয়া\s*দাও|বানাই\s*দাও|বানাই\s*দেও|বানাই\s*দে|বানায়া\s*দাও|বানায়\s*দাও|বানায়\s*দে|বানাও|বানান|বানাতে|তৈরি\s*করো|তৈরী\s*করো|তৈরি\s*করে\s*দাও|তৈরী\s*করে\s*দাও|তৈরি\s*করে\s*দেও|তৈরি\s*করে\s*দে|জেনারেট\s*করো|জেনারেট\s*করে\s*দাও|জেনারেট\s*করে\s*দেও|জেনারেট\s*করে\s*দে|করে\s*দাও|করে\s*দেও|করে\s*দে)/.test(trimmed);
    const hasBengaliVisualScene = /(?:হলুদ|লাল|নীল|সবুজ|কালো|সাদা|গোলাপি|কমলা|বেগুনি|সোনালী|টি-শার্ট|টিশার্ট|গেঞ্জি|শার্ট|প্যান্ট|হাফ\s*প্যান্ট|শাড়ি|পাঞ্জাবি|জামা|পোশাক|চশমা|দাঁড়িয়ে|দাঁড়িয়ে|বসে\s*আছে|হাঁটছে|দৌড়াচ্ছে|হাসছে|পাহাড়|নদী|বৃষ্টি|আকাশ|সূর্যাস্ত)/.test(trimmed) &&
      /(?:ছেলে|মেয়ে|মেয়ে|মানুষ|লোক|বাচ্চা|শিশু|পাখি|বিড়াল|বিড়াল|কুকুর|বাঘ|সিংহ|গাড়ি|গাড়ি|বাড়ি|বাড়ি|ফুল|গাছ|দাও|দেও|দে|দেখাও|দাঁড়িয়ে|দাঁড়িয়ে|বসে)/.test(trimmed);
    // If it contains an image keyword, a drawing verb, a creation verb, or a visual scene description for a non-text subject
    if ((hasBengaliImg || hasBengaliDrawingVerb || hasBengaliMakeVerb || hasBengaliVisualScene) && !isBengaliTextTask) {
      return {
        isImage: true,
        prompt: preserveAndCleanPrompt(trimmed),
        originalPrompt: trimmed,
        quantity,
        variations,
        style,
        aspectRatio,
        isBengali: true,
      };
    }
  }

  // 4. Banglish Intent Detection (covering all common spellings, typos like "chobu", "banat", "banaw", "poto", and visual scene descriptions)
  const isBanglishTextTask = /\b(?:kobita|golpo|rochona|chithi|essay|poem|story|paragraph|code|program|list|script|email|message|bakkha|uttor|kake\s+bole|bolte\s+ki)\b/i.test(trimmed);
  const banglishImgKeyword = /\b(?:chobi|chobu|chabi|cobi|cabi|sobi|shobi|subi|chobita|chobiti|sobita|chobir|sobir|picture|pikchar|pcture|pic|pik|photo|poto|foto|photota|image|imej|imaj|drawing|wallpaper|portrait|portret|illustration|drissho|drisho|poster|sketch|painting|artwork)\b/i;
  const banglishDrawOrMake = /\b(?:akho|aako|ako|anko|ake\s+dao|eke\s+dao|ake\s+de|eke\s+de|banao|banaw|banan|banat|banate|banai\s+dao|banai\s+deo|banai\s+de|banaye\s+dao|banaye\s+deo|banaye\s+de|banaye\s+dey|baniye\s+dao|baniye\s+deo|baniye\s+de|banaya\s+dao|banaya\s+de|banaia\s+dao|banaia\s+de|banay\s+dao|banay\s+daw|banay\s+de|banay\s+deo|toiri\s+kore\s+dao|toiri\s+kore\s+deo|toiri\s+kore\s+de|generate\s+kore\s+dao|generate\s+kore\s+deo|generate\s+kore\s+de|generate\s+koro|genarate\s+koro|draw\s+koro|draw\s+kore\s+dao)\b/i;
  const banglishVisualScene = /\b(?:holud|lal|nil|neel|sobuj|shobuj|kalo|sada|shada|golapi|t-shirt|tshirt|genji|shirt|half\s*pant|pant|shari|saree|panjabi|jama|choshma|dariye|daraye|bose|boshe)\b/i.test(trimmed) &&
    /\b(?:chele|chhele|meye|manush|lok|baccha|pakhi|biral|kukur|gari|bari|dao|deo|de|dekhao|dakhaw|kore\s+dao|kore\s+deo|kore\s+de|dariye\s+ache|bose\s+ache)\b/i.test(trimmed);
  if ((banglishImgKeyword.test(trimmed) || banglishDrawOrMake.test(trimmed) || banglishVisualScene) && !isBanglishTextTask) {
    return {
      isImage: true,
      prompt: preserveAndCleanPrompt(trimmed),
      originalPrompt: trimmed,
      quantity,
      variations,
      style,
      aspectRatio,
      isBengali: true,
    };
  }

  // 4b. Other Multilingual Image Intent Detection (Hindi, Hinglish, Urdu, Arabic, Spanish, French, German, Indonesian, Turkish, etc.)
  const multilingualImgMatch = /(?:तस्वीर|फोटो|चित्र|पेंटिंग|बनाओ|बनाएं|दिखाओ|تصویر|صورة|ارسم|أنشئ|imagen|dibujo|dibuja|genera\s+una\s+imagen|dessine|génère\s+une\s+image|bild\s+erstellen|zeichnet|buatkan\s+gambar|buat\s+gambar|resim\s+çiz|görsel\s+oluştur|\b(?:tasveer|tasvir|chitra|fotto)\s*(?:banao|banaye|dikhao|do)\b|\b(?:ek\s+ladka|ek\s+ladki)\b.*\b(?:banao|dikhao|peela|laal|neela|khada)\b)/i.test(trimmed);
  if (multilingualImgMatch) {
    return {
      isImage: true,
      prompt: preserveAndCleanPrompt(trimmed),
      originalPrompt: trimmed,
      quantity,
      variations,
      style,
      aspectRatio,
      isBengali: true, // Triggers multilingual-to-English visual translation
    };
  }

  // 5. English Visual Intent Patterns
  const positivePatterns = [
    // Direct command with visual keywords (singular or plural or variations)
    // e.g. "Generate an image of a cat", "Make a cinematic image of a futuristic city", "Create a sunset image"
    /^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:generate|create|render|produce|make|draw|paint|sketch|illustrate|visualize)\s+(?:me\s+)?(?:(?:\d+|a|an|one|two|three|four|several|some|a\s+few)\s+)?(?:different\s+)?(?:[\w-]+\s+){0,3}(?:images?|pictures?|photos?|photographs?|artworks?|drawings?|illustrations?|wallpapers?|portraits?|posters?|versions?|variations?|options?|renders?|scenes?|visuals?)\b/i,
    // "photo of...", "picture of...", "image of...", "painting of...", "drawing of..."
    /^(?:an?\s+)?(?:(?:hd|4k|high\s+quality|detailed|close-up|realistic|cinematic)\s+)?(?:photos?|pictures?|images?|paintings?|drawings?|illustrations?|sketches?|renders?|artworks?)\s+(?:of|showing|depicting|with)\s+.+/i,
    // Ending in visual noun: e.g. "Create a sunset image", "Make a futuristic city picture"
    /^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:generate|create|render|produce|make)\s+(?:me\s+)?(?:an?\s+|the\s+)?(.+?)\s+(?:images?|pictures?|photos?|photographs?|drawings?|illustrations?|artworks?|renders?|wallpapers?)\b/i,
    // "generate 4 futuristic cyberpunk cities", "create 2 concept vehicles"
    /^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:generate|create|render|produce|make|draw|paint|sketch|illustrate|visualize)\s+(?:me\s+)?(?:\d+|one|two|three|four|five|a\s+couple\s+of|a\s+few)\s+(?:different\s+)?[\w\s-]+\b/i,
    // Direct visual verbs: "Draw a cat for me", "Paint a sunset", "Visualize the solar system"
    /^(?:please\s+)?(?:can\s+you\s+)?(?:draw|paint|sketch|illustrate|visualize)\s+(?:me\s+)?(?:something|an?\s+|the\s+|[\w\s-]+)/i,
    // Direct visual entity generation (with or without article): "Create a red sports car", "Generate a futuristic city at night", "Generate a cat", "Make realistic portrait of a boy"
    /^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:generate|create|render|produce|make)\s+(?:me\s+)?(?:an?\s+|the\s+)?(?:[\w\s,-]+)\b/i,
    // "Create artwork", "Make a picture"
    /^(?:please\s+)?(?:can\s+you\s+)?(?:make\s+a\s+picture|create\s+artwork|generate\s+artwork|visualize\s+something)\b/i,
    // "Show me an image of...", "Give me a picture of..."
    /^(?:please\s+)?(?:can\s+you\s+)?(?:give|show|send)\s+(?:me\s+)?(?:(?:\d+|an?|one|two|three|four)\s+)?(?:different\s+)?(?:images?|pictures?|artworks?|paintings?|illustrations?|photos?|photographs?|wallpapers?|portraits?|posters?|versions?|variations?)\s+(?:of|showing|depicting|with)\b/i,
    // "I want an image of...", "I need 4 pictures of..."
    /^(?:i\s+want|i\s+need|i\'d\s+like)\s+(?:(?:\d+|an?|one|two|three|four)\s+)?(?:different\s+)?(?:images?|pictures?|photos?|artworks?|drawings?|illustrations?|wallpapers?|versions?|variations?)\s+(?:of|showing|depicting|with)\b/i,
    // "Create a square black-and-white portrait", "Create a cinematic poster with..."
    /^(?:generate|create|make|render)\s+(?:an?\s+)?(?:square\s+|cinematic\s+|photorealistic\s+|realistic\s+|black-and-white\s+|black\s+and\s+white\s+|3d\s+|anime\s+|cyberpunk\s+|minimalist\s+)?(?:portrait|poster|photo|picture|image|scene|landscape|illustration)\b/i,
    // Descriptive visual prompts without explicit "generate" verb:
    // e.g. "realistic mountain landscape at sunrise", "square black and white portrait of an old sailor", "A realistic portrait of a young boy standing confidently..."
    /^(?:an?\s+)?(?:realistic|photorealistic|hyperrealistic|ultra-realistic|cinematic|square|b&w|black\s+and\s+white|vintage|minimalist|surreal|macro)\s+(?:[\w-]+\s+){0,3}(?:landscape|seascape|cityscape|portrait|photo|photograph|poster|painting|render|artwork|scene|illustration|view|shot)\b/i,
    // "cinematic movie poster for a sci-fi space mission", "movie poster of an astronaut"
    /^(?:an?\s+)?(?:cinematic\s+)?(?:movie|film)\s+poster\s+(?:for|of|depicting|with)\b/i,
    // "portrait of [someone/something]"
    /^(?:an?\s+)?(?:square\s+|black\s+and\s+white\s+|b&w\s+|realistic\s+|cinematic\s+)?portrait\s+of\s+/i,
    // "oil painting / watercolor / pencil sketch / 3d render of ..."
    /^(?:an?\s+)?(?:oil\s+painting|watercolor\s+painting|pencil\s+sketch|concept\s+art|digital\s+painting|3d\s+render|macro\s+photo(?:graph)?)\s+(?:of|showing|depicting)\b/i,
    // Visual scene description followed by trailing command e.g. "... , generate an image", "... , make a picture"
    /\b(?:generate|create|make|draw|render)\s+(?:this\s+)?(?:an?\s+)?(?:image|picture|photo|photograph|portrait|illustration|scene)\s*$/i,
    // English visual character/clothing/pose scene description e.g. "a young boy standing wearing a bright yellow t-shirt and half-pants"
    /^(?:a|an)\s+(?:young\s+|little\s+|old\s+|tall\s+|beautiful\s+|realistic\s+)?(?:boy|girl|man|woman|child|person|kid|cat|dog)\s+(?:standing|sitting|walking|running|wearing|dressed\s+in)\b.*\b(?:t-shirt|tshirt|shirt|pants?|shorts|dress|saree|suit|jacket|yellow|red|blue|black|white|green)\b/i,
  ];

  const isMatched = positivePatterns.some((p) => p.test(trimmed));
  if (isMatched) {
    const prompt = preserveAndCleanPrompt(trimmed);
    return {
      isImage: true,
      prompt,
      originalPrompt: trimmed,
      quantity,
      variations,
      style,
      aspectRatio,
      isBengali: false,
    };
  }

  return {
    isImage: false,
    prompt: '',
    originalPrompt: trimmed,
    quantity: 1,
    variations: false,
    style,
    aspectRatio: '1:1',
    isBengali: false,
  };
}
