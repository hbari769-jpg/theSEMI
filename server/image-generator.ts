import { GoogleGenAI } from '@google/genai';
import { db, FileRecord } from './db.js';
import { uploadToSupabaseStorage, deleteFromSupabaseStorage, generateStoragePath } from './supabase-storage.js';
import { safeLogger } from './error-handler.js';
import { IMAGE_MODELS } from './models.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

const UPLOADS_DIR = path.resolve('uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface GenerateImageOptions {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  style?: string;
  userId: string;
  conversationId?: string;
  seed?: number;
  variationIndex?: number;
  quantity?: number;
  variations?: boolean;
}

export interface ImageGenerationResult {
  imageBuffer: Buffer;
  mimeType: string;
  providerModel: string;
}

/**
 * Common Provider Interface to allow seamless image generation
 */
export interface ImageGenerationProvider {
  readonly id: string;
  readonly name: string;
  isConfigured(): boolean;
  generate(options: GenerateImageOptions): Promise<ImageGenerationResult>;
}

/**
 * Google GenAI Image Provider (Gemini Nano Banana: gemini-3.1-flash-lite-image / gemini-3.1-flash-image)
 * Production-supported multimodal image generation using @google/genai SDK generateContent
 */
export class GoogleImageProvider implements ImageGenerationProvider {
  readonly id = IMAGE_MODELS.DEFAULT;
  readonly name = `Aestific Visual Engine (${IMAGE_MODELS.DEFAULT})`;
  private static quotaCooldownUntil = 0;

  isConfigured(): boolean {
    if (Date.now() < GoogleImageProvider.quotaCooldownUntil) {
      return false;
    }
    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    return Boolean(apiKey && !apiKey.startsWith('MY_') && apiKey !== 'YOUR_GEMINI_API_KEY');
  }

  private getClient(): GoogleGenAI {
    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    if (!apiKey || apiKey.startsWith('MY_') || apiKey === 'YOUR_GEMINI_API_KEY') {
      throw new Error('Image generation service is temporarily unavailable. Please try again later.');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async generate(options: GenerateImageOptions): Promise<ImageGenerationResult> {
    const { prompt, aspectRatio = '1:1', style = 'natural' } = options;
    const ai = this.getClient();

    // Preserve the user's original prompt and details verbatim
    let finalPrompt = prompt.trim();

    // Only apply gentle style modifier if requested, not already in prompt, and style is not 'natural'/'none'/'standard'
    const cleanStyle = (style || '').toLowerCase().trim();
    if (cleanStyle && cleanStyle !== 'natural' && cleanStyle !== 'none' && cleanStyle !== 'standard') {
      const styleMap: Record<string, string> = {
        photorealistic: 'realistic photography, natural lighting',
        realistic: 'realistic photography, natural lighting',
        black_and_white: 'black and white monochrome photography, high contrast grayscale',
        cinematic: 'cinematic film still, 35mm photography, dramatic lighting, rich depth of field',
        anime: 'anime style, vibrant art, clean line art',
        cyberpunk: 'cyberpunk style, neon lighting',
        '3d_render': '3D render style, clean volumetric lighting',
        '3d': '3D render style, clean volumetric lighting',
        fantasy: 'fantasy style, atmospheric lighting',
        oil_painting: 'oil painting style, textured brushwork',
        minimalist: 'minimalist vector art, clean composition',
      };
      const modifier = styleMap[cleanStyle] || `${cleanStyle} style`;
      if (!finalPrompt.toLowerCase().includes(cleanStyle.replace('_', ' ')) && !finalPrompt.toLowerCase().includes(modifier.toLowerCase())) {
        finalPrompt += `, ${modifier}`;
      }
    }

    // Configurable production timeout: at least 45-60s
    const timeoutMs = parseInt(process.env.IMAGE_GENERATION_TIMEOUT_MS || '45000', 10) || 45000;
    const candidateModels = [IMAGE_MODELS.DEFAULT, IMAGE_MODELS.HIGH_QUALITY];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        console.log(`[Image Provider: ${this.id}] Authoritative generation with ${model} (seed: ${options.seed ?? 'auto'})...`);

        const generatePromise = ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                text: finalPrompt,
              },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio,
            },
            ...(options.seed !== undefined ? { seed: options.seed } : {}),
          },
        });

        let timerId: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise((_, reject) => {
          timerId = setTimeout(() => {
            reject(new Error(`Timeout waiting for Google model ${model} after ${timeoutMs}ms`));
          }, timeoutMs);
        });

        const response: any = await Promise.race([generatePromise, timeoutPromise]).finally(() => {
          if (timerId) clearTimeout(timerId);
        });

        // Search through candidate parts to locate valid image data
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            const mimeType = (part.inlineData.mimeType || 'image/png').toLowerCase();

            // Validate non-trivial image bytes (not empty, corrupted, or few bytes)
            if (imageBuffer.length >= 512) {
              const isPng = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4e && imageBuffer[3] === 0x47;
              const isJpeg = imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff;
              const isWebp = imageBuffer.length > 12 && imageBuffer.subarray(0, 4).toString('ascii') === 'RIFF' && imageBuffer.subarray(8, 12).toString('ascii') === 'WEBP';

              if (!isPng && !isJpeg && !isWebp) {
                safeLogger.warn(`[Google Image: ${model}] Warning: unrecognized magic bytes, length:`, imageBuffer.length);
              }

              return {
                imageBuffer,
                mimeType: mimeType.includes('jpg') ? 'image/jpeg' : mimeType,
                providerModel: model,
              };
            }
          }
        }

        throw new Error('Image generation engine did not return valid visual image data.');
      } catch (err: any) {
        lastError = err;
        const errMsg = (err?.message || '').toLowerCase();

        // Content safety violations should throw immediately without retry or fallback
        if (errMsg.includes('safety') || errMsg.includes('blocked') || errMsg.includes('harmful')) {
          throw new Error('This request was blocked by image safety guidelines. Please adjust your prompt and try again.');
        }

        // If quota is 0 for free tier, cache cooldown for 15 minutes so subsequent requests go straight to Flux without delay
        if (errMsg.includes('limit: 0')) {
          GoogleImageProvider.quotaCooldownUntil = Date.now() + 15 * 60 * 1000;
          break;
        }

        if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted')) {
          GoogleImageProvider.quotaCooldownUntil = Date.now() + 2 * 60 * 1000;
          break;
        }
      }
    }

    const errMsg = (lastError?.message || '').toLowerCase();
    if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted')) {
      const rateLimitErr: any = new Error(
        'Image generation is temporarily unavailable due to high demand. Please try again in a few moments.'
      );
      rateLimitErr.isRateLimit = true;
      rateLimitErr.statusCode = 429;
      rateLimitErr.rawMessage = lastError?.message;
      throw rateLimitErr;
    }

    if (errMsg.includes('timeout')) {
      throw new Error('Image generation timed out. Please try again with a simpler prompt.');
    }

    throw lastError || new Error('Image generation failed.');
  }
}

// Backward compatibility alias for GoogleImagenProvider
export const GoogleImagenProvider = GoogleImageProvider;
export const GoogleGeminiImageProvider = GoogleImageProvider;

function fetchImageOverHttps(url: string, family: 4 | 6, timeoutMs = 16000): Promise<{ status: number; buffer: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        family,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      },
      (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
          res.resume();
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          fetchImageOverHttps(redirectUrl, family, timeoutMs).then(resolve).catch(reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 500,
            buffer: Buffer.concat(chunks),
            contentType: (res.headers['content-type'] || 'image/jpeg') as string,
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`HTTPS request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
  });
}

async function generateViaGradioFluxSpace(
  spaceBaseUrl: string,
  dataPayload: any[],
  timeoutMs = 15000
): Promise<ImageGenerationResult | null> {
  const callRes = await fetch(`${spaceBaseUrl}/gradio_api/call/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: dataPayload }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!callRes.ok) return null;

  const callJson: any = await callRes.json();
  const eventId = callJson?.event_id;
  if (!eventId) return null;

  const sseRes = await fetch(`${spaceBaseUrl}/gradio_api/call/infer/${eventId}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!sseRes.ok) return null;

  const sseText = await sseRes.text();
  const lines = sseText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr.startsWith('[')) {
        try {
          const parsed = JSON.parse(jsonStr);
          const firstItem = parsed?.[0];
          const imgUrl = firstItem?.url || (firstItem?.path ? `${spaceBaseUrl}/gradio_api/file=${firstItem.path}` : null);
          if (imgUrl) {
            const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(timeoutMs) });
            if (imgRes.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              if (buf.length >= 512) {
                const ct = (imgRes.headers.get('content-type') || 'image/webp').toLowerCase();
                return {
                  imageBuffer: buf,
                  mimeType: ct.includes('png') ? 'image/png' : ct.includes('webp') ? 'image/webp' : 'image/jpeg',
                  providerModel: 'FLUX.1-Schnell Neural Engine',
                };
              }
            }
          }
        } catch {
          // ignore malformed intermediate SSE line
        }
      }
    }
  }
  return null;
}

/**
 * Multi-Engine High-Speed Visual Provider (FLUX.1-Schnell + IPv4/IPv6 Pollinations Flux/Turbo)
 * Renders the user's exact translated prompt faithfully with multi-cluster redundancy.
 */
export class PollinationsImageProvider implements ImageGenerationProvider {
  readonly id = 'pollinations-ai';
  readonly name = 'Aestific Flux Visual Engine';

  isConfigured(): boolean {
    return true;
  }

  async generate(options: GenerateImageOptions): Promise<ImageGenerationResult> {
    const { prompt, aspectRatio = '1:1', style = 'photorealistic' } = options;
    const width = aspectRatio === '16:9' ? 1024 : aspectRatio === '9:16' ? 576 : aspectRatio === '4:3' ? 896 : aspectRatio === '3:4' ? 672 : 768;
    const height = aspectRatio === '16:9' ? 576 : aspectRatio === '9:16' ? 1024 : aspectRatio === '4:3' ? 672 : aspectRatio === '3:4' ? 896 : 768;

    let styleKeyword = 'sharp focus, natural lighting, high detail';
    if (style === 'photorealistic' || style === 'realistic') styleKeyword = 'realistic photography, natural lighting, sharp focus';
    else if (style === 'black_and_white') styleKeyword = 'black and white monochrome photography, high contrast grayscale';
    else if (style === 'cinematic') styleKeyword = 'cinematic film still, 35mm photography, dramatic lighting, rich depth of field';
    else if (style === 'anime') styleKeyword = 'anime style, vibrant art, clean line art';
    else if (style === '3d_render' || style === '3d') styleKeyword = '3D render, Pixar style 3D animation, clean volumetric lighting';
    else if (style === 'cyberpunk') styleKeyword = 'cyberpunk style, neon illumination';
    else if (style === 'fantasy') styleKeyword = 'fantasy digital art, atmospheric lighting';
    else if (style === 'oil_painting') styleKeyword = 'oil painting on canvas, classical style, rich texture';
    else if (style === 'minimalist') styleKeyword = 'minimalist vector art, clean composition';

    const cleanPrompt = prompt.trim();
    const cleanLower = cleanPrompt.toLowerCase();
    let fullPrompt = cleanPrompt;

    // Only append style keyword if not already explicitly captured in the prompt
    if (style && style !== 'natural' && style !== 'none' && style !== 'standard') {
      const styleName = style.replace('_', ' ');
      if (!cleanLower.includes(styleName) && !cleanLower.includes(styleKeyword.toLowerCase().slice(0, 15))) {
        fullPrompt = `${cleanPrompt}, ${styleKeyword}`;
      }
    }

    const baseSeed = options.seed ?? Math.floor(Math.random() * 1000000);
    console.log(`[Image Provider: ${this.id}] Generating exact prompt "${fullPrompt}" (seed: ${baseSeed})...`);

    // Tier 1: Fast Black Forest Labs FLUX.1-Schnell Gradio Cluster (~3s, zero IP queue bottleneck, literal prompt adherence)
    try {
      const gradioResult = await generateViaGradioFluxSpace(
        'https://black-forest-labs-flux-1-schnell.hf.space',
        [fullPrompt, baseSeed, false, width, height, 4],
        15000
      );
      if (gradioResult) {
        return gradioResult;
      }
    } catch (gradioErr: any) {
      safeLogger.warn('[FLUX.1-Schnell Cluster 1] note:', gradioErr?.message || gradioErr);
    }

    // Tier 2: Pollinations Flux / Turbo over dedicated IPv4 and IPv6 sockets
    const encodedPrompt = encodeURIComponent(fullPrompt);
    const pollinationsAttempts: Array<{ model: string; family: 4 | 6 }> = [
      { model: 'flux', family: 4 },
      { model: 'turbo', family: 4 },
      { model: 'flux', family: 6 },
    ];

    for (let i = 0; i < pollinationsAttempts.length; i++) {
      const { model: modelName, family } = pollinationsAttempts[i];
      const seed = (baseSeed + i * 137) % 1000000;
      const getUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=${modelName}`;

      try {
        const res = await fetchImageOverHttps(getUrl, family, 16000);
        if (res.status === 200 && res.buffer.length >= 512) {
          const ct = res.contentType.toLowerCase();
          if (ct.includes('image') || (res.buffer[0] === 0xff && res.buffer[1] === 0xd8) || (res.buffer[0] === 0x89 && res.buffer[1] === 0x50)) {
            return {
              imageBuffer: res.buffer,
              mimeType: ct.includes('png') ? 'image/png' : ct.includes('webp') ? 'image/webp' : 'image/jpeg',
              providerModel: `Pollinations ${modelName.toUpperCase()} Engine`,
            };
          }
        }
      } catch (pollErr: any) {
        safeLogger.warn(`[Pollinations ${modelName} IPv${family}] note:`, pollErr?.message || pollErr);
      }
    }

    // Tier 3: Secondary MultimodalArt FLUX.1-Merged Gradio Cluster
    try {
      const mergedResult = await generateViaGradioFluxSpace(
        'https://multimodalart-flux-1-merged.hf.space',
        [fullPrompt, baseSeed, false, width, height, 3.5, 8],
        18000
      );
      if (mergedResult) {
        return mergedResult;
      }
    } catch (mergedErr: any) {
      safeLogger.warn('[FLUX.1-Merged Cluster 2] note:', mergedErr?.message || mergedErr);
    }

    throw new Error('Image generation is temporarily unavailable due to high demand. Please try again in a few moments.');
  }
}

export type ImageProviderMock = (options: GenerateImageOptions) => Promise<{ result: ImageGenerationResult; providerName: string }>;

let imageProviderMock: ImageProviderMock | null = null;

export function setImageProviderMock(mock: ImageProviderMock | null) {
  imageProviderMock = mock;
}

/**
 * Authoritative Image Provider Dispatcher
 * Tries Google Image Provider first when configured, and seamlessly falls back to Pollinations Flux Engine
 * whenever Google hits quota limits (429 / limit: 0) or transient errors.
 */
class ImageProviderManager {
  private googleImageProvider: ImageGenerationProvider = new GoogleImageProvider();
  private fallbackProvider: ImageGenerationProvider = new PollinationsImageProvider();
  private inFlightJobs = new Map<string, Promise<{ result: ImageGenerationResult; providerName: string }>>();

  async generateImage(options: GenerateImageOptions): Promise<{ result: ImageGenerationResult; providerName: string }> {
    // Idempotency: Prevent duplicate generation jobs for identical requests in-flight
    const jobKey = `${options.userId || 'anon'}:${options.prompt.trim().toLowerCase()}:${options.aspectRatio || '1:1'}:${options.style || 'natural'}:${options.variationIndex ?? 0}`;
    const existingJob = this.inFlightJobs.get(jobKey);
    if (existingJob) {
      safeLogger.info(`[Image Provider] Reusing in-flight generation job for key: ${jobKey}`);
      return existingJob;
    }

    const jobPromise = this.executeGenerateImage(options);
    this.inFlightJobs.set(jobKey, jobPromise);

    try {
      return await jobPromise;
    } finally {
      this.inFlightJobs.delete(jobKey);
    }
  }

  private async executeGenerateImage(options: GenerateImageOptions): Promise<{ result: ImageGenerationResult; providerName: string }> {
    if (imageProviderMock) {
      return imageProviderMock(options);
    }

    // 1. Try Google Image Provider first when configured
    if (this.googleImageProvider.isConfigured()) {
      try {
        const result = await this.googleImageProvider.generate(options);
        return { result, providerName: this.googleImageProvider.name };
      } catch (err: any) {
        const errMsg = (err?.message || '').toLowerCase();

        // Safety violation throws immediately without fallback
        if (errMsg.includes('safety') || errMsg.includes('blocked') || errMsg.includes('harmful')) {
          throw err;
        }

        // On 429 / quota / free-tier limit: 0 or transient upstream error, seamlessly engage Pollinations Flux fallback!
        safeLogger.warn('[Image Generation] Google provider unavailable or rate-limited, engaging Pollinations Flux fallback:', err?.message || err);
      }
    }

    // 2. Resilient Pollinations Flux Fallback
    const result = await this.fallbackProvider.generate(options);
    return { result, providerName: this.fallbackProvider.name };
  }

  isAnyProviderConfigured(): boolean {
    return true;
  }
}

export const imageProviderManager = new ImageProviderManager();

// Export aliases for backwards compatibility
export const GeminiNanoBananaProvider = GoogleImagenProvider;
export const GeminiImagenProvider = GoogleImagenProvider;

/**
 * Core Image Generation Pipeline
 * 1. Validates prompt and params
 * 2. Invokes active ImageGenerationProvider
 * 3. Validates actual image bytes (Bug 7)
 * 4. Saves image to local cache with unique id
 * 5. Synchronously persists to Supabase Storage before DB record creation
 * 6. Creates authoritative FileRecord in database with 30-day retention tracking
 * 7. Performs compensating storage cleanup if database insertion fails
 */
const inFlightImageJobs = new Map<string, Promise<FileRecord & { dataUrl?: string }>>();

export async function generateImageWithImagen(options: GenerateImageOptions): Promise<FileRecord & { dataUrl?: string }> {
  const { prompt, aspectRatio = '1:1', style = 'natural', userId, conversationId, variationIndex = 0 } = options;

  if (!prompt || prompt.trim().length < 2) {
    throw new Error('Please provide a descriptive prompt for image generation.');
  }

  // Idempotency: Deduplicate identical generation requests in-flight
  const jobKey = `${userId || 'anon'}:${conversationId || 'none'}:${prompt.trim().toLowerCase()}:${aspectRatio}:${style}:${variationIndex}`;
  const existingJob = inFlightImageJobs.get(jobKey);
  if (existingJob) {
    safeLogger.info(`[Image Pipeline] Reusing in-flight generation job for key: ${jobKey}`);
    return existingJob;
  }

  const jobPromise = executeGenerateImageWithImagen(options);
  inFlightImageJobs.set(jobKey, jobPromise);

  try {
    return await jobPromise;
  } finally {
    inFlightImageJobs.delete(jobKey);
  }
}

async function executeGenerateImageWithImagen(options: GenerateImageOptions): Promise<FileRecord & { dataUrl?: string }> {
  const { prompt, aspectRatio = '1:1', style = 'natural', userId, conversationId } = options;

  const { result, providerName } = await imageProviderManager.generateImage(options);

  if (!result || !result.imageBuffer || result.imageBuffer.length < 512) {
    throw new Error('Image generation failed to return valid image data.');
  }

  const ext = result.mimeType.includes('png') ? 'png' : result.mimeType.includes('webp') ? 'webp' : result.mimeType.includes('svg') ? 'svg' : 'jpg';
  const uniqueId = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  const filename = `aestific-img-${uniqueId}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  try {
    fs.writeFileSync(filePath, result.imageBuffer);
  } catch (fsErr: any) {
    safeLogger.warn('[Image Generation] Local buffer cache write notice:', fsErr?.message || fsErr);
  }

  const { storagePath } = generateStoragePath(userId, filename);

  // Step 1: Storage Upload (Synchronous verification before authoritative DB record creation)
  const uploadResult = await uploadToSupabaseStorage({
    userId,
    uniqueFileId: filename,
    storagePath,
    buffer: result.imageBuffer,
    mimeType: result.mimeType,
    originalName: `Generated Image: ${prompt.slice(0, 35)}...`,
  });

  if (!uploadResult.success) {
    safeLogger.error('[Image Generation] Storage upload failed for generated image:', uploadResult.error);
    // Cleanup temporary local file on storage failure
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanupErr) {
      safeLogger.warn('[Image Generation] Local temp file cleanup notice:', cleanupErr);
    }
    const storageErr: any = new Error(
      uploadResult.error || 'Image storage service is temporarily unavailable. Please try again in a moment.'
    );
    storageErr.statusCode = 503;
    storageErr.code = 'STORAGE_UNAVAILABLE';
    throw storageErr;
  }

  // Step 2: Database Metadata Save (Only executed after storage persistence is confirmed)
  let fileRecord: FileRecord;
  try {
    fileRecord = await db.createFileRecord({
      userId,
      conversationId,
      storageProvider: uploadResult.storageProvider || 'supabase',
      bucketName: uploadResult.bucketName || 'aestific-files',
      storagePath: uploadResult.storagePath || storagePath,
      uniqueFileId: filename,
      filename,
      originalName: `Generated Image: ${prompt.slice(0, 35)}...`,
      type: 'image',
      mimeType: result.mimeType,
      sizeBytes: result.imageBuffer.length,
      url: `/api/files/download/${filename}`,
      extractedText: `AI Generated Image for prompt: "${prompt}" (Style: ${style}, Provider: ${providerName})`,
    });
  } catch (dbErr: any) {
    safeLogger.error('[Image Generation] Database record creation failed after successful storage upload. Attempting compensating cleanup:', dbErr?.message || dbErr);
    // Compensating Cleanup: delete from storage and disk
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}
    try {
      await deleteFromSupabaseStorage(storagePath, filename, uploadResult.bucketName);
      safeLogger.info('[Image Generation] Compensating storage cleanup completed for:', storagePath);
    } catch (cleanupErr: any) {
      safeLogger.warn('[Image Generation] Compensating storage cleanup error notice:', cleanupErr?.message || cleanupErr);
    }
    const dbException: any = new Error('Database error occurred while recording generated image.');
    dbException.code = dbErr?.code || 'DATABASE_ERROR';
    dbException.statusCode = 500;
    dbException.cause = dbErr;
    throw dbException;
  }

  // Track daily usage metric
  await db.incrementDailyUsage(userId, { photoCount: 1 });

  // Ephemeral filesystem hardening: In production, clean up temporary local buffer cache ONLY if securely stored in cloud
  if (process.env.NODE_ENV === 'production' && uploadResult.storageProvider === 'supabase') {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanupNotice) {
      safeLogger.warn('[Image Generation] Post-generation temporary file cleanup notice:', cleanupNotice);
    }
  }

  return {
    ...fileRecord,
    dataUrl: `data:${result.mimeType};base64,${result.imageBuffer.toString('base64')}`,
  };
}

export const generateGeminiImage = generateImageWithImagen;
export const generateAIImage = generateImageWithImagen;

export interface GenerateImagesOptions extends GenerateImageOptions {
  quantity?: number;
  variations?: boolean;
}

/**
 * Generates one or more images according to quantity and variation parameters.
 * Each variation receives a distinct seed and subtle creative angle while strictly
 * maintaining the user's full original prompt constraints.
 */
export async function generateAIImages(options: GenerateImagesOptions): Promise<Array<FileRecord & { dataUrl?: string }>> {
  const count = Math.min(Math.max(options.quantity || 1, 1), 4);

  if (count === 1) {
    const single = await generateImageWithImagen(options);
    return [single];
  }

  // Generate genuinely different results using different seeds while keeping
  // the EXACT SAME user prompt and constraints (no automatic creative modifiers).
  const results: Array<FileRecord & { dataUrl?: string }> = [];
  const baseSeed = options.seed ?? Math.floor(Math.random() * 1000000);

  for (let index = 0; index < count; index++) {
    if (index > 0) {
      // Small pause between generations to respect rate limits
      await new Promise((r) => setTimeout(r, 600));
    }

    const seed = (baseSeed + index * 9973 + Math.floor(Math.random() * 10000)) % 1000000;

    try {
      const img = await generateImageWithImagen({
        ...options,
        prompt: options.prompt.trim(),
        seed,
        variationIndex: index,
      });
      results.push(img);
    } catch (varErr: any) {
      safeLogger.warn(`[Image Generation] Variation ${index + 1}/${count} generation interrupted:`, varErr?.message || varErr);
      if (results.length > 0) {
        // If provider limits prevent full requested quantity, gracefully return available result(s)
        break;
      }
      throw varErr;
    }
  }

  return results;
}



