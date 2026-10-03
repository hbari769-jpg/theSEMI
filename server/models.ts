// Centralized AI Model Configurations for Aestific
export interface ModelConfig {
  id: string;
  name: string;
  provider: 'Google' | 'Groq' | 'DeepSeek' | 'Exa' | 'OpenAI' | 'Anthropic' | 'Custom';
  underlyingModel: string;
  description: string;
  speed: string;
  context: string;
  role?: 'default' | 'coding_reasoning' | 'hard_tasks' | 'web_research' | 'image' | 'fallback';
  isDefault?: boolean;
}

export const GEMINI_MODELS = {
  // Ultra-fast, highly responsive lightweight flagship model for instant streaming and maximum free capacity
  MAIN: 'gemini-3.1-flash-lite',
  FAST: 'gemini-3.1-flash-lite',
  PRO: 'gemini-3.6-flash',
} as const;

// Production Google Image Generation Models (Nano Banana series)
export const IMAGE_MODELS = {
  DEFAULT: 'gemini-3.1-flash-lite-image',
  HIGH_QUALITY: 'gemini-3.1-flash-image',
} as const;

export const DEFAULT_IMAGE_MODEL_ID = IMAGE_MODELS.DEFAULT;

// Groq fallback model representation (strictly separated from Gemini)
export const GROQ_MODELS = {
  FALLBACK: 'openai/gpt-oss-120b',
} as const;

export const GROQ_FALLBACK_MODEL = {
  id: 'openai/gpt-oss-120b',
  name: 'Aestific Intelligence (Groq Fallback)',
  provider: 'Groq',
  underlyingModel: 'openai/gpt-oss-120b',
} as const;

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'aestific-core',
    name: 'Aestific Core (Default)',
    provider: 'Custom',
    underlyingModel: GEMINI_MODELS.MAIN,
    description: 'Ultra-fast, lightweight multimodal AI model optimized for instantaneous sub-second streaming, conversational chat, daily tasks, and general assistance',
    speed: 'Instant (Ultra-low latency streaming)',
    context: '1M tokens',
    role: 'default',
    isDefault: true,
  },
  {
    id: 'aestific-reason',
    name: 'Aestific Reason',
    provider: 'Custom',
    underlyingModel: 'deepseek-v4-flash',
    description: 'Specialized high-efficiency reasoning model for coding, code reviews, debugging, and algorithmic problem solving',
    speed: 'High Speed',
    context: '64K tokens',
    role: 'coding_reasoning',
  },
  {
    id: 'aestific-ultra',
    name: 'Aestific Ultra',
    provider: 'Custom',
    underlyingModel: 'gemini-3.1-pro-preview',
    description: 'Flagship intelligence model for genuinely hard multi-step reasoning, mathematical proofs, and complex system design',
    speed: 'Deep Reasoning',
    context: '2M tokens',
    role: 'hard_tasks',
  },
  {
    id: 'aestific-visual',
    name: 'Aestific Visual',
    provider: 'Custom',
    underlyingModel: IMAGE_MODELS.DEFAULT,
    description: 'Aestific multimodal image generation and visual synthesis engine',
    speed: 'Instant Generation',
    context: 'Standard Image',
    role: 'image',
  },
];

export const DEFAULT_MODEL_ID = GEMINI_MODELS.MAIN;
export const LOW_COST_MODEL_ID = GEMINI_MODELS.FAST;

/**
 * Server-side source of truth for validating and normalizing explicit model selection.
 * Prevents clients from passing arbitrary strings into upstream provider APIs.
 */
export function normalizeAndValidateModel(modelInput?: string | null): string {
  if (!modelInput || typeof modelInput !== 'string') {
    return DEFAULT_MODEL_ID;
  }
  const clean = modelInput.trim().toLowerCase().replace(/^models\//, '');
  if (clean === 'default' || clean === 'auto' || clean === 'aestific-core' || clean === 'core') {
    return DEFAULT_MODEL_ID;
  }
  if (
    clean === 'aestific-reason' ||
    clean === 'reason' ||
    clean === 'code' ||
    clean === 'deepseek-v4-flash' ||
    clean === 'deepseek-chat' ||
    clean === 'deepseek'
  ) {
    return 'deepseek-v4-flash';
  }
  if (
    clean === 'aestific-ultra' ||
    clean === 'ultra' ||
    clean === 'gemini-3.1-pro-preview' ||
    clean === 'gemini-pro' ||
    clean === 'pro'
  ) {
    return 'gemini-3.1-pro-preview';
  }
  if (
    clean === 'gemini-3.1-flash-lite' ||
    clean === 'gemini-flash' ||
    clean === 'flash' ||
    clean === 'gemini-3.8-flash' ||
    clean === 'gemini-3.6-flash'
  ) {
    return 'gemini-3.1-flash-lite';
  }
  const match = AVAILABLE_MODELS.find((m) => m.id === clean && m.role !== 'image');
  if (match) {
    return match.underlyingModel;
  }
  return DEFAULT_MODEL_ID;
}

/**
 * Server-side source of truth for validating and normalizing image model selection.
 * Ensures legacy Imagen IDs (imagen-3.0-generate-002, imagen-3.0-fast-generate-001)
 * are NEVER used as active production targets and securely maps them to the supported
 * Google image-generation models.
 */
export function normalizeAndValidateImageModel(modelInput?: string | null): string {
  if (!modelInput || typeof modelInput !== 'string') {
    return DEFAULT_IMAGE_MODEL_ID;
  }
  const clean = modelInput.trim().toLowerCase().replace(/^models\//, '');
  if (
    clean === 'gemini-3.1-flash-image' ||
    clean === 'high-quality' ||
    clean === 'hd' ||
    clean === 'pro-image'
  ) {
    return IMAGE_MODELS.HIGH_QUALITY;
  }
  if (
    clean === 'aestific-visual' ||
    clean === 'visual' ||
    clean === 'gemini-3.1-flash-lite-image' ||
    clean === 'default' ||
    clean === 'auto' ||
    clean === 'image' ||
    clean === 'imagen' ||
    clean === 'imagen-3' ||
    clean === 'imagen-3.0-generate-002' ||
    clean === 'imagen-3.0-fast-generate-001'
  ) {
    return IMAGE_MODELS.DEFAULT;
  }
  return DEFAULT_IMAGE_MODEL_ID;
}




