import { Conversation, Message, MessageRole } from '../types';

const DB_NAME = 'aestific_local_vault';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

/**
 * Normalizes any raw/legacy or imported message object to ensure 100% schema consistency.
 * Symmetrically populates `role`, `sender`, `liked`, `disliked`, `reactions`, and `model`/`modelUsed`.
 */
export function normalizeMessage(raw: any): Message {
  if (!raw) {
    return {
      id: 'msg_' + Date.now(),
      conversationId: '',
      role: 'assistant',
      sender: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };
  }

  const isUser = raw.role === 'user' || raw.sender === 'user';
  const role: MessageRole = raw.role || (isUser ? 'user' : 'assistant');
  const sender: 'user' | 'assistant' = isUser ? 'user' : 'assistant';
  const liked = raw.liked === true || raw.reactions?.liked === true;
  const disliked = raw.disliked === true || raw.reactions?.disliked === true;
  const model = raw.model || raw.modelUsed || undefined;

  return {
    id: String(raw.id || 'msg_' + Date.now()),
    conversationId: String(raw.conversationId || raw.conversation_id || ''),
    userId: raw.userId || raw.user_id,
    role,
    sender,
    content: typeof raw.content === 'string' ? raw.content : '',
    attachments: Array.isArray(raw.attachments) ? raw.attachments : undefined,
    fileIds: Array.isArray(raw.fileIds) ? raw.fileIds : (Array.isArray(raw.file_ids) ? raw.file_ids : undefined),
    liked,
    disliked,
    reactions: {
      liked,
      disliked,
    },
    model,
    modelUsed: model,
    tokensUsed: raw.tokensUsed || raw.tokens_used,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    isStreaming: Boolean(raw.isStreaming),
    webSearchUsed: Boolean(raw.webSearchUsed),
    sources: Array.isArray(raw.sources) && raw.sources.length > 0 ? raw.sources : undefined,
  };
}

export async function openLocalDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('conversations')) {
        const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
        convStore.createIndex('userId', 'userId', { unique: false });
        convStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('conversationId', 'conversationId', { unique: false });
        msgStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });
}

export async function saveConversationLocal(conv: Conversation): Promise<void> {
  try {
    const db = await openLocalDB();
    const tx = db.transaction('conversations', 'readwrite');
    const store = tx.objectStore('conversations');
    store.put(conv);
  } catch (err) {
    console.warn('[LocalDB] saveConversationLocal notice:', err);
  }
}

export async function saveConversationsBulkLocal(convs: Conversation[]): Promise<void> {
  try {
    const db = await openLocalDB();
    const tx = db.transaction('conversations', 'readwrite');
    const store = tx.objectStore('conversations');
    for (const c of convs) {
      store.put(c);
    }
  } catch (err) {
    console.warn('[LocalDB] saveConversationsBulkLocal notice:', err);
  }
}

export async function getConversationsLocal(userId: string): Promise<Conversation[]> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve) => {
      const tx = db.transaction('conversations', 'readonly');
      const store = tx.objectStore('conversations');
      const index = store.index('userId');
      const req = index.getAll(userId);

      req.onsuccess = () => {
        const results = (req.result || []) as Conversation[];
        results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function saveMessageLocal(msg: Message): Promise<void> {
  try {
    const db = await openLocalDB();
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    store.put(normalizeMessage(msg));
  } catch (err) {
    console.warn('[LocalDB] saveMessageLocal notice:', err);
  }
}

export async function saveMessagesBulkLocal(messages: Message[]): Promise<void> {
  try {
    const db = await openLocalDB();
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    for (const msg of messages) {
      store.put(normalizeMessage(msg));
    }
  } catch (err) {
    console.warn('[LocalDB] saveMessagesBulkLocal notice:', err);
  }
}

export async function deleteMessageLocal(msgId: string): Promise<void> {
  try {
    const db = await openLocalDB();
    const tx = db.transaction('messages', 'readwrite');
    tx.objectStore('messages').delete(msgId);
  } catch (err) {
    console.warn('[LocalDB] deleteMessageLocal notice:', err);
  }
}

export async function getMessagesLocal(conversationId: string): Promise<Message[]> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve) => {
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('conversationId');
      const req = index.getAll(conversationId);

      req.onsuccess = () => {
        const rawResults = (req.result || []) as any[];
        const results: Message[] = rawResults.map(normalizeMessage);
        results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function deleteConversationLocal(convId: string): Promise<void> {
  try {
    const db = await openLocalDB();
    const tx = db.transaction(['conversations', 'messages'], 'readwrite');
    tx.objectStore('conversations').delete(convId);
    
    // Also delete associated messages
    const msgStore = tx.objectStore('messages');
    const index = msgStore.index('conversationId');
    const req = index.getAllKeys(convId);
    req.onsuccess = () => {
      for (const key of req.result) {
        msgStore.delete(key);
      }
    };
  } catch (err) {
    console.warn('[LocalDB] deleteConversationLocal notice:', err);
  }
}

export async function clearUserLocalVault(userId: string): Promise<void> {
  try {
    const db = await openLocalDB();
    const tx = db.transaction(['conversations', 'messages'], 'readwrite');
    const convStore = tx.objectStore('conversations');
    const msgStore = tx.objectStore('messages');
    const convIndex = convStore.index('userId');
    const req = convIndex.getAll(userId);

    req.onsuccess = () => {
      const userConvs = (req.result || []) as Conversation[];
      for (const c of userConvs) {
        convStore.delete(c.id);
        const msgIndex = msgStore.index('conversationId');
        const msgKeyReq = msgIndex.getAllKeys(c.id);
        msgKeyReq.onsuccess = () => {
          for (const key of msgKeyReq.result) {
            msgStore.delete(key);
          }
        };
      }
    };
  } catch (err) {
    console.warn('[LocalDB] clearUserLocalVault notice:', err);
  }
}

export async function getEstimatedLocalDBSize(userId?: string): Promise<{ countConversations: number; countMessages: number; estimatedKBRange: string }> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve) => {
      const tx = db.transaction(['conversations', 'messages'], 'readonly');
      const convStore = tx.objectStore('conversations');
      const msgStore = tx.objectStore('messages');

      if (userId) {
        const convIndex = convStore.index('userId');
        const convReq = convIndex.getAll(userId);
        convReq.onsuccess = () => {
          const convs = (convReq.result || []) as Conversation[];
          const convCount = convs.length;
          let msgCount = 0;
          let pending = convCount;

          if (convCount === 0) {
            return resolve({ countConversations: 0, countMessages: 0, estimatedKBRange: '0 KB' });
          }

          for (const c of convs) {
            const msgIndex = msgStore.index('conversationId');
            const mCountReq = msgIndex.count(c.id);
            mCountReq.onsuccess = () => {
              msgCount += mCountReq.result || 0;
              pending--;
              if (pending <= 0) {
                const estKB = Math.round((convCount * 0.5) + (msgCount * 1.5));
                resolve({
                  countConversations: convCount,
                  countMessages: msgCount,
                  estimatedKBRange: estKB > 1024 ? `${(estKB / 1024).toFixed(1)} MB` : `${estKB} KB`,
                });
              }
            };
          }
        };
        convReq.onerror = () => resolve({ countConversations: 0, countMessages: 0, estimatedKBRange: '0 KB' });
      } else {
        const convCountReq = convStore.count();
        const msgCountReq = msgStore.count();

        tx.oncomplete = () => {
          const convCount = convCountReq.result || 0;
          const msgCount = msgCountReq.result || 0;
          const estKB = Math.round((convCount * 0.5) + (msgCount * 1.5));
          resolve({
            countConversations: convCount,
            countMessages: msgCount,
            estimatedKBRange: estKB > 1024 ? `${(estKB / 1024).toFixed(1)} MB` : `${estKB} KB`,
          });
        };

        tx.onerror = () => {
          resolve({ countConversations: 0, countMessages: 0, estimatedKBRange: '0 KB' });
        };
      }
    });
  } catch {
    return { countConversations: 0, countMessages: 0, estimatedKBRange: '0 KB' };
  }
}

export async function exportAllLocalData(userId?: string): Promise<{ jsonBlob: Blob; markdownString: string }> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['conversations', 'messages'], 'readonly');
    const convStore = tx.objectStore('conversations');
    const msgStore = tx.objectStore('messages');

    let allConvsReq: IDBRequest;
    if (userId) {
      allConvsReq = convStore.index('userId').getAll(userId);
    } else {
      allConvsReq = convStore.getAll();
    }
    const allMsgsReq = msgStore.getAll();

    tx.oncomplete = () => {
      const convs = (allConvsReq.result || []) as Conversation[];
      const validConvIds = new Set(convs.map((c) => c.id));
      const rawMsgs = (allMsgsReq.result || []) as any[];
      const msgs: Message[] = rawMsgs
        .filter((m) => validConvIds.has(m.conversationId || m.conversation_id))
        .map(normalizeMessage);

      // Build JSON
      const fullData = {
        exportedAt: new Date().toISOString(),
        clientEngine: 'Aestific Local-First Vault',
        userId: userId || undefined,
        conversationsCount: convs.length,
        messagesCount: msgs.length,
        conversations: convs.map((c) => ({
          ...c,
          messages: msgs.filter((m) => m.conversationId === c.id),
        })),
      };

      const jsonBlob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });

      // Build Markdown
      let md = `# Aestific Conversations Export\nExported on: ${new Date().toLocaleString()}\n\n---\n\n`;
      for (const conv of convs) {
        md += `## ${conv.title || 'Untitled Conversation'}\n`;
        md += `*Model: ${conv.model} | Created: ${new Date(conv.createdAt).toLocaleString()}*\n\n`;
        const convMsgs = msgs.filter((m) => m.conversationId === conv.id);
        for (const m of convMsgs) {
          const isUser = m.role === 'user' || m.sender === 'user';
          md += `### ${isUser ? 'User' : 'Aestific AI'} (${new Date(m.createdAt).toLocaleTimeString()}):\n`;
          md += `${m.content}\n\n`;
        }
        md += `---\n\n`;
      }

      resolve({ jsonBlob, markdownString: md });
    };

    tx.onerror = () => {
      reject(new Error('Export failed'));
    };
  });
}

/**
 * Safely imports conversation & message archives into local IndexedDB
 * Validates schema, binds to target userId, normalizes messages, and prevents duplicates.
 */
export async function importLocalVaultData(
  rawData: any,
  targetUserId: string
): Promise<{ importedConversations: number; importedMessages: number }> {
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Invalid archive format: expected JSON object');
  }

  const rawConvs = Array.isArray(rawData.conversations)
    ? rawData.conversations
    : Array.isArray(rawData)
    ? rawData
    : [];

  if (rawConvs.length === 0) {
    throw new Error('No valid conversations found in file to import');
  }

  const db = await openLocalDB();
  const tx = db.transaction(['conversations', 'messages'], 'readwrite');
  const convStore = tx.objectStore('conversations');
  const msgStore = tx.objectStore('messages');

  let convCount = 0;
  let msgCount = 0;

  for (const c of rawConvs) {
    if (!c || !c.id) continue;
    const safeConvId = String(c.id);
    const safeConv: Conversation = {
      id: safeConvId,
      userId: targetUserId,
      title: typeof c.title === 'string' ? c.title.slice(0, 200) : 'Imported Conversation',
      lastMessagePreview: typeof c.lastMessagePreview === 'string' ? c.lastMessagePreview : '',
      isPinned: Boolean(c.isPinned),
      isArchived: Boolean(c.isArchived),
      model: typeof c.model === 'string' ? c.model : 'openai/gpt-oss-120b',
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || new Date().toISOString(),
    };
    convStore.put(safeConv);
    convCount++;

    const rawMsgs = Array.isArray(c.messages) ? c.messages : [];
    for (const m of rawMsgs) {
      if (!m) continue;
      const normalized = normalizeMessage({
        ...m,
        conversationId: safeConvId,
        userId: targetUserId,
      });
      msgStore.put(normalized);
      msgCount++;
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve({ importedConversations: convCount, importedMessages: msgCount });
    };
    tx.onerror = () => {
      reject(tx.error || new Error('Failed to save imported data to IndexedDB'));
    };
  });
}
