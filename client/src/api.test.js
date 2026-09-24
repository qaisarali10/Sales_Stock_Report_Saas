import { afterEach, describe, expect, test, vi } from 'vitest';
import { apiUrl, downloadName, excelFallbackName, getAuthStatus, getDistributors, getHealth, login, matchDistributor } from './api.js';

afterEach(() => vi.restoreAllMocks());

describe('API helpers', () => {
  test('bypasses the Vite proxy during local development', () => {
    expect(apiUrl('/parse')).toBe('/api/parse');
  });

  test('creates safe Excel fallback names for every supported format', () => {
    expect(excelFallbackName('report.pdf')).toBe('report.xlsx');
    expect(excelFallbackName('scan.JPG')).toBe('scan.xlsx');
    expect(excelFallbackName('stock.xlsx')).toBe('stock.xlsx');
  });

  test('reads the server supplied download filename', () => {
    const response = new Response(null, { headers: { 'Content-Disposition': 'attachment; filename="parsed.xlsx"' } });
    expect(downloadName(response, 'fallback.xlsx')).toBe('parsed.xlsx');
  });

  test('loads authentication capabilities', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ required: true, authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    await expect(getAuthStatus()).resolves.toMatchObject({ required: true, authenticated: false });
  });

  test('loads the live database health summary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ activeDistributors: 442 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    await expect(getHealth()).resolves.toMatchObject({ activeDistributors: 442 });
  });

  test('loads active distributors for a manual match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ distributors: [{ _id: 'abc', name: 'Al Noor Medicine Company' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    await expect(getDistributors()).resolves.toEqual([{ _id: 'abc', name: 'Al Noor Medicine Company' }]);
  });

  test('requests a distributor match for the uploaded filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ match: { _id: 'abc', name: 'AL-FATEH PHARMA' }, suggestions: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(matchDistributor('AL-FATEH PHARMA & Co.pdf')).resolves.toEqual({ match: { _id: 'abc', name: 'AL-FATEH PHARMA' }, suggestions: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/distributors/match?filename=AL-FATEH%20PHARMA%20%26%20Co.pdf');
  });

  test('surfaces login errors returned by the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Invalid username or password.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })));
    await expect(login('admin', 'wrong')).rejects.toThrow('Invalid username or password.');
  });
});
