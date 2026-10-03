import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getGeminiClient, getGroqClient } from './groq.js';
import { safeLogger } from './error-handler.js';
import { GEMINI_MODELS, GROQ_MODELS } from './models.js';

export interface BehaviorRuleVersion {
  version: number;
  title: string;
  instruction: string;
  category: string;
  priority: 'critical' | 'high' | 'standard';
  updatedAt: string;
  updatedBy: string;
  changeNote?: string;
}

export interface BehaviorRule {
  id: string;
  title: string;
  instruction: string;
  category: string;
  priority: 'critical' | 'high' | 'standard';
  status: 'active' | 'disabled';
  version: number;
  createdAt: string;
  createdBy: string;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  versions: BehaviorRuleVersion[];
}

export interface BehaviorAuditLog {
  id: string;
  adminId: string;
  adminName: string;
  action: 'CREATE' | 'UPDATE' | 'ENABLE' | 'DISABLE' | 'DELETE' | 'ROLLBACK';
  ruleId: string;
  ruleTitle: string;
  previousVersion?: number;
  newVersion?: number;
  timestamp: string;
  details: string;
}

export interface BehaviorProposal {
  title: string;
  instruction: string;
  category: string;
  priority: 'critical' | 'high' | 'standard';
  previewExplanation: string;
}

const BEHAVIOR_RULES_FILE = path.resolve(process.cwd(), 'behavior-rules.json');
const BEHAVIOR_AUDIT_FILE = path.resolve(process.cwd(), 'behavior-audit.json');

const INITIAL_DEFAULT_RULES: BehaviorRule[] = [
  {
    id: 'rule_pedagogy_intuitive',
    title: 'Intuitive First Principle Explanations',
    instruction: 'When explaining complex or difficult concepts, first explain simply and intuitively using a plain-language concept or metaphor, then provide a concrete real-world example, and finally delve into technical mechanics if needed.',
    category: 'Explanation & Pedagogy',
    priority: 'high',
    status: 'active',
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: 'Atif Al Wasi (Superadmin)',
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: 'Atif Al Wasi (Superadmin)',
    versions: [
      {
        version: 1,
        title: 'Intuitive First Principle Explanations',
        instruction: 'When explaining complex or difficult concepts, first explain simply and intuitively using a plain-language concept or metaphor, then provide a concrete real-world example, and finally delve into technical mechanics if needed.',
        category: 'Explanation & Pedagogy',
        priority: 'high',
        updatedAt: new Date().toISOString(),
        updatedBy: 'Atif Al Wasi (Superadmin)',
        changeNote: 'Initial foundational pedagogy standard.',
      },
    ],
  },
  {
    id: 'rule_code_explanations',
    title: 'Post-Code Implementation Breakdown',
    instruction: 'When providing code or programming solutions, present the clean, functional code first, followed immediately by a concise explanation of how it works and key architectural decisions.',
    category: 'Code & Technical',
    priority: 'high',
    status: 'active',
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: 'Atif Al Wasi (Superadmin)',
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: 'Atif Al Wasi (Superadmin)',
    versions: [
      {
        version: 1,
        title: 'Post-Code Implementation Breakdown',
        instruction: 'When providing code or programming solutions, present the clean, functional code first, followed immediately by a concise explanation of how it works and key architectural decisions.',
        category: 'Code & Technical',
        priority: 'high',
        updatedAt: new Date().toISOString(),
        updatedBy: 'Atif Al Wasi (Superadmin)',
        changeNote: 'Initial foundational coding response standard.',
      },
    ],
  },
  {
    id: 'rule_tone_calm_supportive',
    title: 'Empathetic & Supportive Communication',
    instruction: 'Maintain a calm, intellectually humble, and encouraging tone. Be transparent about technical trade-offs without ever being dismissive or overly verbose.',
    category: 'Tone & Personality',
    priority: 'standard',
    status: 'active',
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: 'Atif Al Wasi (Superadmin)',
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: 'Atif Al Wasi (Superadmin)',
    versions: [
      {
        version: 1,
        title: 'Empathetic & Supportive Communication',
        instruction: 'Maintain a calm, intellectually humble, and encouraging tone. Be transparent about technical trade-offs without ever being dismissive or overly verbose.',
        category: 'Tone & Personality',
        priority: 'standard',
        updatedAt: new Date().toISOString(),
        updatedBy: 'Atif Al Wasi (Superadmin)',
        changeNote: 'Initial conversational tone guideline.',
      },
    ],
  },
];

// In-memory cache
let cachedRules: BehaviorRule[] | null = null;
let cachedAuditLogs: BehaviorAuditLog[] | null = null;

function readRulesFromDisk(): BehaviorRule[] {
  try {
    if (fs.existsSync(BEHAVIOR_RULES_FILE)) {
      const raw = fs.readFileSync(BEHAVIOR_RULES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    safeLogger.error('Failed to read behavior-rules.json:', err);
  }
  // If file does not exist or empty, write initial default rules
  writeRulesToDisk(INITIAL_DEFAULT_RULES);
  return INITIAL_DEFAULT_RULES;
}

function writeRulesToDisk(rules: BehaviorRule[]): void {
  try {
    fs.writeFileSync(BEHAVIOR_RULES_FILE, JSON.stringify(rules, null, 2), 'utf-8');
    cachedRules = rules;
  } catch (err) {
    safeLogger.error('Failed to write behavior-rules.json:', err);
  }
}

function readAuditFromDisk(): BehaviorAuditLog[] {
  try {
    if (fs.existsSync(BEHAVIOR_AUDIT_FILE)) {
      const raw = fs.readFileSync(BEHAVIOR_AUDIT_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    safeLogger.error('Failed to read behavior-audit.json:', err);
  }
  return [];
}

function writeAuditToDisk(logs: BehaviorAuditLog[]): void {
  try {
    fs.writeFileSync(BEHAVIOR_AUDIT_FILE, JSON.stringify(logs, null, 2), 'utf-8');
    cachedAuditLogs = logs;
  } catch (err) {
    safeLogger.error('Failed to write behavior-audit.json:', err);
  }
}

/**
 * Security & Priority Guard:
 * Admin-created behavior must NOT be able to disable or weaken:
 * - authentication/security, passwords, API keys, privacy protections, user isolation, rate limits, safety
 * Never allow an admin rule to expose secrets, private user data, or internal security info.
 */
export function validateAndSanitizeBehaviorRule(instruction: string): { safe: boolean; error?: string } {
  const lower = instruction.toLowerCase();

  const forbiddenPatterns = [
    /ignore.*security/i,
    /bypass.*(?:auth|password|token|login|hash|rate limit)/i,
    /reveal.*(?:api key|secret|password|bearer|cookie|token|credential)/i,
    /leak.*(?:user data|email|database|private)/i,
    /disable.*(?:safety|firewall|isolation|security|protection)/i,
    /print.*(?:process\.env|env vars|credentials)/i,
    /grant.*(?:admin|elevated).*without.*auth/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(lower)) {
      return {
        safe: false,
        error: 'Security Guard Violation: Global behavior rules cannot weaken system security, bypass authentication, or expose confidential secrets and credentials.',
      };
    }
  }

  if (instruction.trim().length < 5) {
    return { safe: false, error: 'Rule instruction is too short. Provide a clear behavioral directive.' };
  }

  return { safe: true };
}

// -------------------------------------------------------------
// PUBLIC CRUD & MANAGEMENT APIs
// -------------------------------------------------------------

export function getAllBehaviorRules(): BehaviorRule[] {
  if (!cachedRules) {
    cachedRules = readRulesFromDisk();
  }
  return cachedRules;
}

export function getActiveBehaviorRules(): BehaviorRule[] {
  return getAllBehaviorRules().filter((r) => r.status === 'active');
}

export function getBehaviorAuditLogs(): BehaviorAuditLog[] {
  if (!cachedAuditLogs) {
    cachedAuditLogs = readAuditFromDisk();
  }
  return cachedAuditLogs.slice().reverse(); // newest first
}

export function addAuditLog(entry: Omit<BehaviorAuditLog, 'id' | 'timestamp'>): void {
  const logs = getBehaviorAuditLogs().reverse(); // keep chronological on disk
  const newLog: BehaviorAuditLog = {
    id: `audit_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  logs.push(newLog);
  // Cap at 1000 logs
  const capped = logs.slice(-1000);
  writeAuditToDisk(capped);
}

export function createBehaviorRule(params: {
  title: string;
  instruction: string;
  category?: string;
  priority?: 'critical' | 'high' | 'standard';
  adminId: string;
  adminName: string;
}): BehaviorRule {
  const validation = validateAndSanitizeBehaviorRule(params.instruction);
  if (!validation.safe) {
    throw new Error(validation.error || 'Invalid rule');
  }

  const rules = getAllBehaviorRules();
  const ruleId = `rule_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  const newRule: BehaviorRule = {
    id: ruleId,
    title: params.title.trim(),
    instruction: params.instruction.trim(),
    category: (params.category || 'General Behavior').trim(),
    priority: params.priority || 'high',
    status: 'active',
    version: 1,
    createdAt: now,
    createdBy: params.adminName,
    lastUpdatedAt: now,
    lastUpdatedBy: params.adminName,
    versions: [
      {
        version: 1,
        title: params.title.trim(),
        instruction: params.instruction.trim(),
        category: (params.category || 'General Behavior').trim(),
        priority: params.priority || 'high',
        updatedAt: now,
        updatedBy: params.adminName,
        changeNote: 'Initial rule activation.',
      },
    ],
  };

  rules.unshift(newRule);
  writeRulesToDisk(rules);

  addAuditLog({
    adminId: params.adminId,
    adminName: params.adminName,
    action: 'CREATE',
    ruleId: newRule.id,
    ruleTitle: newRule.title,
    newVersion: 1,
    details: `Created and globally activated behavior rule "${newRule.title}" (v1)`,
  });

  return newRule;
}

export function updateBehaviorRule(
  ruleId: string,
  updates: {
    title?: string;
    instruction?: string;
    category?: string;
    priority?: 'critical' | 'high' | 'standard';
    changeNote?: string;
  },
  adminId: string,
  adminName: string
): BehaviorRule {
  const rules = getAllBehaviorRules();
  const index = rules.findIndex((r) => r.id === ruleId);
  if (index === -1) {
    throw new Error('Behavior rule not found.');
  }

  const existing = rules[index];

  if (updates.instruction) {
    const validation = validateAndSanitizeBehaviorRule(updates.instruction);
    if (!validation.safe) {
      throw new Error(validation.error || 'Invalid rule instruction');
    }
  }

  const now = new Date().toISOString();
  const nextVersion = (existing.version || 1) + 1;

  const updatedTitle = (updates.title ?? existing.title).trim();
  const updatedInstruction = (updates.instruction ?? existing.instruction).trim();
  const updatedCategory = (updates.category ?? existing.category).trim();
  const updatedPriority = updates.priority ?? existing.priority;

  const newVersionRecord: BehaviorRuleVersion = {
    version: nextVersion,
    title: updatedTitle,
    instruction: updatedInstruction,
    category: updatedCategory,
    priority: updatedPriority,
    updatedAt: now,
    updatedBy: adminName,
    changeNote: updates.changeNote || `Updated by admin ${adminName}`,
  };

  const updatedRule: BehaviorRule = {
    ...existing,
    title: updatedTitle,
    instruction: updatedInstruction,
    category: updatedCategory,
    priority: updatedPriority,
    version: nextVersion,
    lastUpdatedAt: now,
    lastUpdatedBy: adminName,
    versions: [...(existing.versions || []), newVersionRecord],
  };

  rules[index] = updatedRule;
  writeRulesToDisk(rules);

  addAuditLog({
    adminId,
    adminName,
    action: 'UPDATE',
    ruleId: updatedRule.id,
    ruleTitle: updatedRule.title,
    previousVersion: existing.version,
    newVersion: nextVersion,
    details: `Updated behavior rule to v${nextVersion}: ${updates.changeNote || 'Standard modification'}`,
  });

  return updatedRule;
}

export function toggleBehaviorRule(
  ruleId: string,
  adminId: string,
  adminName: string
): BehaviorRule {
  const rules = getAllBehaviorRules();
  const index = rules.findIndex((r) => r.id === ruleId);
  if (index === -1) {
    throw new Error('Behavior rule not found.');
  }

  const rule = rules[index];
  const newStatus = rule.status === 'active' ? 'disabled' : 'active';
  rule.status = newStatus;
  rule.lastUpdatedAt = new Date().toISOString();
  rule.lastUpdatedBy = adminName;

  rules[index] = rule;
  writeRulesToDisk(rules);

  addAuditLog({
    adminId,
    adminName,
    action: newStatus === 'active' ? 'ENABLE' : 'DISABLE',
    ruleId: rule.id,
    ruleTitle: rule.title,
    newVersion: rule.version,
    details: `${newStatus === 'active' ? 'Enabled' : 'Disabled'} behavior rule "${rule.title}" (v${rule.version})`,
  });

  return rule;
}

export function rollbackBehaviorRule(
  ruleId: string,
  targetVersion: number,
  adminId: string,
  adminName: string
): BehaviorRule {
  const rules = getAllBehaviorRules();
  const index = rules.findIndex((r) => r.id === ruleId);
  if (index === -1) {
    throw new Error('Behavior rule not found.');
  }

  const rule = rules[index];
  const targetRecord = (rule.versions || []).find((v) => v.version === targetVersion);
  if (!targetRecord) {
    throw new Error(`Version v${targetVersion} not found in rule history.`);
  }

  const now = new Date().toISOString();
  const nextVersion = (rule.version || 1) + 1;

  const newVersionRecord: BehaviorRuleVersion = {
    version: nextVersion,
    title: targetRecord.title,
    instruction: targetRecord.instruction,
    category: targetRecord.category,
    priority: targetRecord.priority,
    updatedAt: now,
    updatedBy: adminName,
    changeNote: `Rolled back to v${targetVersion}`,
  };

  const rolledBackRule: BehaviorRule = {
    ...rule,
    title: targetRecord.title,
    instruction: targetRecord.instruction,
    category: targetRecord.category,
    priority: targetRecord.priority,
    version: nextVersion,
    lastUpdatedAt: now,
    lastUpdatedBy: adminName,
    versions: [...(rule.versions || []), newVersionRecord],
  };

  rules[index] = rolledBackRule;
  writeRulesToDisk(rules);

  addAuditLog({
    adminId,
    adminName,
    action: 'ROLLBACK',
    ruleId: rule.id,
    ruleTitle: rule.title,
    previousVersion: rule.version,
    newVersion: nextVersion,
    details: `Rolled back rule "${rule.title}" from v${rule.version} to match specifications of v${targetVersion}`,
  });

  return rolledBackRule;
}

export function deleteBehaviorRule(
  ruleId: string,
  adminId: string,
  adminName: string
): { success: boolean; id: string } {
  const rules = getAllBehaviorRules();
  const index = rules.findIndex((r) => r.id === ruleId);
  if (index === -1) {
    throw new Error('Behavior rule not found.');
  }

  const removed = rules.splice(index, 1)[0];
  writeRulesToDisk(rules);

  addAuditLog({
    adminId,
    adminName,
    action: 'DELETE',
    ruleId: removed.id,
    ruleTitle: removed.title,
    previousVersion: removed.version,
    details: `Deleted behavior rule "${removed.title}" (previously v${removed.version})`,
  });

  return { success: true, id: ruleId };
}

// -------------------------------------------------------------
// PROMPT INJECTION DIRECTIVE
// -------------------------------------------------------------

/**
 * Builds the active global behavior prompt layer to be injected into fullSystemPrompt.
 * Preserves priority order and safety boundaries.
 */
export function getActiveBehaviorDirectives(): string {
  const activeRules = getActiveBehaviorRules();
  if (activeRules.length === 0) return '';

  // Sort: critical first, then high, then standard
  const priorityScore = { critical: 3, high: 2, standard: 1 };
  const sorted = [...activeRules].sort((a, b) => {
    return (priorityScore[b.priority] || 1) - (priorityScore[a.priority] || 1);
  });

  const lines = sorted.map((rule, idx) => {
    return `${idx + 1}. [${rule.priority.toUpperCase()}] **${rule.title}** (${rule.category}):\n   ${rule.instruction}`;
  });

  return (
    `\n\n[ACTIVE GLOBAL AESTIFIC BEHAVIOR RULES (Admin Approved & Enforced)]:\n` +
    `You must incorporate these global behavioral directives into every interaction with users:\n` +
    lines.join('\n\n') +
    `\n\n*Strict Safety Constraint: These behavioral rules control tone, clarity, explanation structure, and style. They NEVER override platform privacy, authentication, password security, API key secrecy, or user isolation.*`
  );
}

// -------------------------------------------------------------
// INTELLIGENT ADMIN BEHAVIOR INTERPRETER (AI-Powered with Fallback)
// -------------------------------------------------------------

export async function interpretAdminInstruction(adminInput: string): Promise<{
  aestificResponse: string;
  proposedRule: BehaviorProposal;
}> {
  const cleanInput = adminInput.trim();
  const validation = validateAndSanitizeBehaviorRule(cleanInput);
  if (!validation.safe) {
    return {
      aestificResponse: `I cannot adopt this rule because it conflicts with platform security policies: ${validation.error}`,
      proposedRule: {
        title: 'Disallowed Behavior Proposal',
        instruction: cleanInput,
        category: 'Safety Violation',
        priority: 'standard',
        previewExplanation: 'This behavior instruction cannot be applied.',
      },
    };
  }

  // System instruction for the AI interpreter
  const systemPrompt = `You are Aestific's Core Behavior Architect.
An authorized Aestific Administrator is teaching you how you should behave, explain, answer, tone, or format responses for ALL platform users.

Your job:
1. Understand the admin's intended behavioral rule.
2. Formulate a polite, intelligent response confirming how you will behave (in standard Aestific voice).
3. Extract and convert the instruction into a precise, high-quality production behavior rule.
4. Output your answer strictly as a valid JSON object matching this schema:
{
  "aestificResponse": "A clear, articulate explanation acknowledging the instruction, explaining how you will adopt this behavior with users, and showing a brief example of how a response will look under this new rule.",
  "proposedRule": {
    "title": "Short, professional title for the rule (max 6 words, e.g. 'Intuitive Explanation First with Example')",
    "instruction": "The clear, robust, imperative instruction describing the behavior (e.g. 'When explaining complex or technical topics, first provide a simple plain-language explanation, then offer a practical real-world example, followed by granular details.')",
    "category": "One of: 'Explanation & Pedagogy', 'Code & Technical', 'Tone & Personality', 'Response Structure', 'User Addressing', 'Formatting & Conciseness', 'General Behavior'",
    "priority": "One of: 'critical', 'high', 'standard'",
    "previewExplanation": "A 1-2 sentence summary of the practical effect on user conversations."
  }
}
Do NOT include markdown backticks around the JSON. Output only the raw JSON.`;

  // 1. Try Groq LPU fast response
  const groq = getGroqClient();
  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Admin Instruction:\n"${cleanInput}"` },
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw);
      if (parsed?.aestificResponse && parsed?.proposedRule?.instruction) {
        return {
          aestificResponse: parsed.aestificResponse,
          proposedRule: {
            title: parsed.proposedRule.title || 'Custom Behavior Rule',
            instruction: parsed.proposedRule.instruction,
            category: parsed.proposedRule.category || 'General Behavior',
            priority: parsed.proposedRule.priority || 'high',
            previewExplanation: parsed.proposedRule.previewExplanation || 'Applies to all user conversations.',
          },
        };
      }
    } catch (err) {
      safeLogger.warn('Groq behavior interpretation fallback:', err);
    }
  }

  // 2. Try Gemini
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: GEMINI_MODELS.MAIN,
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nAdmin Instruction:\n"${cleanInput}"` }],
          },
        ],
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      });

      const raw = response.text || '{}';
      const parsed = JSON.parse(raw);
      if (parsed?.aestificResponse && parsed?.proposedRule?.instruction) {
        return {
          aestificResponse: parsed.aestificResponse,
          proposedRule: {
            title: parsed.proposedRule.title || 'Custom Behavior Rule',
            instruction: parsed.proposedRule.instruction,
            category: parsed.proposedRule.category || 'General Behavior',
            priority: parsed.proposedRule.priority || 'high',
            previewExplanation: parsed.proposedRule.previewExplanation || 'Applies to all user conversations.',
          },
        };
      }
    } catch (err) {
      safeLogger.warn('Gemini behavior interpretation fallback:', err);
    }
  }

  // 3. Deterministic Intelligent Fallback
  return {
    aestificResponse: `Understood. I have formulated this into an active behavior rule. Whenever a user interacts with Aestific, I will adhere to your instruction: "${cleanInput}". You can review the preview below and click "Apply" to activate it globally, or test it first.`,
    proposedRule: {
      title: cleanInput.length > 40 ? `${cleanInput.slice(0, 37)}...` : cleanInput,
      instruction: cleanInput,
      category: cleanInput.toLowerCase().includes('code')
        ? 'Code & Technical'
        : cleanInput.toLowerCase().includes('tone') || cleanInput.toLowerCase().includes('friendly')
        ? 'Tone & Personality'
        : cleanInput.toLowerCase().includes('explain')
        ? 'Explanation & Pedagogy'
        : 'General Behavior',
      priority: 'high',
      previewExplanation: `Ensures all responses incorporate: "${cleanInput}"`,
    },
  };
}

// -------------------------------------------------------------
// TEST MODE: CURRENT RESPONSE vs CANDIDATE RESPONSE COMPARISON
// -------------------------------------------------------------

export async function testBehaviorComparison(params: {
  sampleQuestion: string;
  candidateInstruction: string;
}): Promise<{
  currentResponse: string;
  candidateResponse: string;
}> {
  const { sampleQuestion, candidateInstruction } = params;

  const basePrompt = `You are Aestific, an advanced, highly intelligent AI assistant. Aestific is an AI platform founded by Atif Al Wasi. Provide a helpful, natural response to the user.`;

  const candidatePrompt = `${basePrompt}\n\n[CANDIDATE BEHAVIOR RULE]:\n${candidateInstruction}\nStrictly adhere to the candidate rule in your explanation and response style.`;

  const groq = getGroqClient();
  const gemini = getGeminiClient();

  let currentResponse = '';
  let candidateResponse = '';

  // Generate Current Response
  if (groq) {
    try {
      const [resCurrent, resCandidate] = await Promise.all([
        groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: basePrompt },
            { role: 'user', content: sampleQuestion },
          ],
          temperature: 0.6,
          max_tokens: 600,
        }),
        groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: candidatePrompt },
            { role: 'user', content: sampleQuestion },
          ],
          temperature: 0.6,
          max_tokens: 600,
        }),
      ]);

      currentResponse = resCurrent.choices?.[0]?.message?.content || '';
      candidateResponse = resCandidate.choices?.[0]?.message?.content || '';
    } catch (err) {
      safeLogger.warn('Groq test comparison error:', err);
    }
  }

  // Fallback to Gemini if needed
  if (!currentResponse && gemini) {
    try {
      const [resCurrent, resCandidate] = await Promise.all([
        gemini.models.generateContent({
          model: GEMINI_MODELS.MAIN,
          contents: [{ role: 'user', parts: [{ text: `${basePrompt}\n\nUser Question:\n${sampleQuestion}` }] }],
          config: { temperature: 0.6, maxOutputTokens: 600 },
        }),
        gemini.models.generateContent({
          model: GEMINI_MODELS.MAIN,
          contents: [{ role: 'user', parts: [{ text: `${candidatePrompt}\n\nUser Question:\n${sampleQuestion}` }] }],
          config: { temperature: 0.6, maxOutputTokens: 600 },
        }),
      ]);

      currentResponse = resCurrent.text || '';
      candidateResponse = resCandidate.text || '';
    } catch (err) {
      safeLogger.warn('Gemini test comparison error:', err);
    }
  }

  if (!currentResponse) {
    currentResponse = `(Sample Current Response for: "${sampleQuestion}")\n\nHere is a standard response explaining the topic directly without the specialized behavioral directive applied.`;
  }
  if (!candidateResponse) {
    candidateResponse = `(Sample Candidate Response with Rule: "${candidateInstruction}")\n\nFirst, here is an intuitive simple explanation followed by a concrete real-world example, fully conforming to your candidate behavior rule!`;
  }

  return { currentResponse, candidateResponse };
}
