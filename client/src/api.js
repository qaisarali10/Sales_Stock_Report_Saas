async function jsonResponse(response, fallback) {
  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.message || text || fallback || `Server error ${response.status}`);
    error.status = response.status;
    error.code = data.code;
    error.suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    throw error;
  }
  return data;
}

// The API is always same-origin: Express serves the built client in production,
// and the Vite dev server proxies /api to the backend in development.
export function apiUrl(path) {
  return `/api${path}`;
}

export async function getAuthStatus() {
  const response = await fetch(apiUrl('/auth/status'), { credentials: 'include' });
  return jsonResponse(response, 'Could not check authentication status.');
}

export async function getHealth() {
  const response = await fetch(apiUrl('/health'), { credentials: 'include' });
  return jsonResponse(response, 'Could not load system status.');
}

export async function login(username, password) {
  const response = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return jsonResponse(response, 'Could not sign in.');
}

export async function logout() {
  const response = await fetch(apiUrl('/auth/logout'), { method: 'POST', credentials: 'include' });
  return jsonResponse(response, 'Could not sign out.');
}

export async function getHistory(limit = 5) {
  const response = await fetch(apiUrl(`/history?limit=${limit}`), { credentials: 'include' });
  const data = await jsonResponse(response, 'Could not load history.');
  return data.history;
}

export async function getDistributors() {
  const response = await fetch(apiUrl('/distributors'), { credentials: 'include' });
  const data = await jsonResponse(response, 'Could not load distributors.');
  return data.distributors;
}

export async function matchDistributor(filename) {
  const response = await fetch(apiUrl(`/distributors/match?filename=${encodeURIComponent(filename)}`), { credentials: 'include' });
  const data = await jsonResponse(response, 'Could not match the distributor.');
  return { match: data.match || null, suggestions: data.suggestions || [] };
}

export function downloadName(response, fallback) {
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

export function excelFallbackName(filename) {
  return `${filename.replace(/\.(?:pdf|xlsx|jpe?g|png)$/i, '')}.xlsx`;
}

export async function parsePdf(file, saveFile, distributorId = '') {
  const body = new FormData();
  body.append('pdf_file', file);
  body.append('save_file', String(saveFile));
  if (distributorId) body.append('distributor_id', distributorId);
  const response = await fetch(apiUrl('/parse'), { method: 'POST', body, credentials: 'include' });
  if (!response.ok) await jsonResponse(response, `Server error ${response.status}`);
  return {
    blob: await response.blob(),
    filename: downloadName(response, excelFallbackName(file.name)),
    rows: Number(response.headers.get('X-Parsed-Rows') || 0)
  };
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
