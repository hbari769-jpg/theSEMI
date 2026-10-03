import { safeLogger } from './error-handler.js';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekChatOptions {
  messages: DeepSeekMessage[];
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

let deepSeekCooldownUntil = 0;

export function markDeepSeekUnavailable(durationMs = 15 * 60 * 1000) {
  deepSeekCooldownUntil = Date.now() + durationMs;
}

export function isDeepSeekConfigured(): boolean {
  if (Date.now() < deepSeekCooldownUntil) {
    return false;
  }
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  return Boolean(apiKey && !apiKey.startsWith('MY_') && apiKey !== 'YOUR_DEEPSEEK_API_KEY');
}

export function getDeepSeekApiKey(): string | null {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (apiKey && !apiKey.startsWith('MY_') && apiKey !== 'YOUR_DEEPSEEK_API_KEY') {
    return apiKey;
  }
  return null;
}

/**
 * Stream chat completions from DeepSeek API (OpenAI-compatible protocol)
 */
export async function streamDeepSeekChat(options: DeepSeekChatOptions) {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) {
    throw new Error('Reasoning engine is temporarily unconfigured on the server.');
  }

  const { messages, systemPrompt, model = 'deepseek-v4-flash', temperature = 0.6 } = options;
  const actualModel = (model === 'deepseek-chat' || !model) ? 'deepseek-v4-flash' : model;

  const formattedMessages: DeepSeekMessage[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    formattedMessages.push({ role: 'system', content: systemPrompt.trim() });
  }

  for (const m of messages) {
    if (m.content && m.content.trim()) {
      formattedMessages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.trim(),
      });
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: actualModel,
        messages: formattedMessages,
        temperature,
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      safeLogger.warn(`Reasoning engine error status ${response.status}:`, errText);
      if (response.status === 402 || response.status === 401) {
        markDeepSeekUnavailable(15 * 60 * 1000); // 15-minute fast-fail cooldown
      }
      throw new Error(`Reasoning engine returned status ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Reasoning engine returned an empty response.');
    }

    // Convert standard web ReadableStream to async generator of token deltas
    async function* parseSseStream(body: ReadableStream<Uint8Array>) {
      const reader = body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') return;

            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                const token = parsed.choices?.[0]?.delta?.content || '';
                if (token) {
                  yield token;
                }
              } catch {
                // Ignore JSON parse chunk errors
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    return {
      provider: 'deepseek' as const,
      model: 'Aestific Reason',
      stream: parseSseStream(response.body),
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    safeLogger.warn('DeepSeek streaming attempt failed:', err?.message || err);
    throw err;
  }
}
