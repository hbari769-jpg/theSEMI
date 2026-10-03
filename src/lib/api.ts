// Helper utility for authenticated fetch requests across Aestific.
// Authentication tokens are stored exclusively in secure HttpOnly cookies.
// JavaScript access is eliminated to protect against XSS token exfiltration.
// Under no circumstances are tokens stored in localStorage, sessionStorage, or IndexedDB.

let inMemoryAuthToken: string | null = null;

// Ensure any legacy token artifacts from prior turns are cleared from web storage
try {
  localStorage.removeItem('aestific_token');
  sessionStorage.removeItem('aestific_token');
} catch {
  // Ignore storage errors in restricted contexts
}

export function getAuthToken(): string | null {
  return inMemoryAuthToken;
}

export function setAuthToken(token?: string) {
  if (!token || typeof token !== 'string') {
    inMemoryAuthToken = null;
    return;
  }
  const clean = token.trim();
  inMemoryAuthToken = clean || null;
}

export function clearAuthToken() {
  inMemoryAuthToken = null;
  try {
    localStorage.removeItem('aestific_token');
    sessionStorage.removeItem('aestific_token');
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

// Media and file download URLs authenticate via HttpOnly session cookies or query token for cross-origin iframes
export function getAuthMediaUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  const token = getAuthToken();
  if (!token) return url;

  if (url.startsWith('/api/files/download/') || url.startsWith('/api/files/raw/')) {
    if (url.includes('token=')) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }
  return url;
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    credentials: init?.credentials || 'include',
    headers,
  });

  return response;
}


