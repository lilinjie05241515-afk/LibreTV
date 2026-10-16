import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { parseBrowseSource, parseCategoryList } from '@/lib/cms-browse';
import { cmsRequestHeaders } from '@/lib/cms-parser';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';
import { checkUpstreamAllowed } from '@/lib/ssrf';
import type { CategoryListResponse } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const params = new URL(req.url).searchParams;
  const source = parseBrowseSource(params.get('source'));
  if (!source) return NextResponse.json({ error: '无效的点播源配置' }, { status: 400 });
  const filterAdult = params.get('filterAdult') !== '0';
  const verdict = await checkUpstreamAllowed(source.url);
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 400 });

  const cacheKey = `categories:${source.url}:${filterAdult}`;
  const cached = getCache<CategoryListResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const res = await fetchUpstream(`${source.url.replace(/\/+$/, '')}?ac=list`, {
      timeoutMs: 8000, headers: cmsRequestHeaders(),
    });
    if (!res.ok) throw new Error(`源站返回 HTTP ${res.status}`);
    const payload = { categories: parseCategoryList(await res.json(), filterAdult) };
    setCache(cacheKey, payload, 10 * 60 * 1000);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '获取分类失败' }, { status: 502 });
  }
}
