import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { parseBrowseList, parseBrowseSource } from '@/lib/cms-browse';
import { cmsRequestHeaders } from '@/lib/cms-parser';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';
import { checkUpstreamAllowed } from '@/lib/ssrf';
import type { BrowseResponse } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const params = new URL(req.url).searchParams;
  const source = parseBrowseSource(params.get('source'));
  const type = params.get('type') || '';
  const page = Number(params.get('page') || '1');
  if (!source) return NextResponse.json({ error: '无效的点播源配置' }, { status: 400 });
  if (!/^\d{1,12}$/.test(type) || type === '0' || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return NextResponse.json({ error: '无效的分类或页码' }, { status: 400 });
  }
  const filterAdult = params.get('filterAdult') !== '0';
  const verdict = await checkUpstreamAllowed(source.url);
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 400 });

  const cacheKey = `browse:${source.key}:${source.name}:${source.url}:${source.isAdult}:${type}:${page}:${filterAdult}`;
  const cached = getCache<BrowseResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const url = `${source.url.replace(/\/+$/, '')}?ac=videolist&t=${type}&pg=${page}`;
    const res = await fetchUpstream(url, { timeoutMs: 8000, headers: cmsRequestHeaders() });
    if (!res.ok) throw new Error(`源站返回 HTTP ${res.status}`);
    const payload = parseBrowseList(await res.json(), source, filterAdult);
    setCache(cacheKey, payload, 60 * 1000);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '获取分类影片失败' }, { status: 502 });
  }
}
