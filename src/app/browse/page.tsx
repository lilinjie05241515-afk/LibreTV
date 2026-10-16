'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { DetailModal } from '@/components/detail-modal';
import { VideoCard } from '@/components/video-card';
import { EmptyState } from '@/components/states';
import { api } from '@/lib/client-api';
import { useAppStore, resolveSource, isInDisabledSubscription, isSourceDisabled } from '@/lib/store';
import { cn, validateSourceUrl } from '@/lib/utils';
import type { CmsCategory, SearchResultItem } from '@/lib/types';

export default function BrowsePage() {
  return <Suspense><BrowseContent /></Suspense>;
}

function BrowseContent() {
  const router = useRouter();
  const params = useSearchParams();
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sourceHealth = useAppStore((s) => s.sourceHealth);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);

  const sources = useMemo(() => {
    const seen = new Set<string>();
    return selectedKeys
      .map((key) => resolveSource({ customAPIs, envSources }, key))
      .filter((source): source is NonNullable<typeof source> => {
        if (!source || !validateSourceUrl(source.url) || seen.has(source.key)) return false;
        seen.add(source.key);
        return true;
      })
      .filter((source) => !isSourceDisabled({ sourceHealth }, source.key))
      .filter((source) => !isInDisabledSubscription({ subscriptions }, source.key));
  }, [customAPIs, envSources, selectedKeys, sourceHealth, subscriptions]);

  const source = sources.find((item) => item.key === params.get('src')) ?? sources[0];
  const categoriesQuery = useQuery({
    queryKey: ['categories', source?.key, source?.url, yellowFilter],
    queryFn: ({ signal }) => api.categories(source!, yellowFilter, signal),
    enabled: Boolean(source),
    staleTime: 10 * 60_000,
  });
  const categories = categoriesQuery.data?.categories ?? [];
  const roots = categories.filter((item) => item.parentId === '0');
  const requested = categories.find((item) => item.id === params.get('c'));
  const root = requested?.parentId === '0'
    ? requested
    : roots.find((item) => item.id === requested?.parentId) ?? roots[0];
  const children = categories.filter((item) => item.parentId === root?.id);
  const category = requested && (requested.parentId === root?.id || (requested.id === root?.id && children.length === 0))
    ? requested
    : children[0] ?? root;
  const rawPage = Number(params.get('p') || '1');
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 10000 ? rawPage : 1;

  const browseQuery = useQuery({
    queryKey: ['browse', source?.key, source?.url, category?.id, page, yellowFilter],
    queryFn: ({ signal }) => api.browse(source!, category!.id, page, yellowFilter, signal),
    enabled: Boolean(source && category),
    staleTime: 60_000,
  });

  const navigate = (nextSource: string, nextCategory?: string, nextPage = 1) => {
    const sp = new URLSearchParams({ src: nextSource, p: String(nextPage) });
    if (nextCategory) sp.set('c', nextCategory);
    setDetailItem(null);
    router.push(`/browse?${sp.toString()}`);
  };
  const chooseRoot = (item: CmsCategory) => {
    const firstChild = categories.find((candidate) => candidate.parentId === item.id);
    navigate(source.key, firstChild?.id ?? item.id);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header showSearch />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-7">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-content">影视分类</h1>
          <p className="text-sm text-muted mt-1">按点播源提供的分类浏览影片。不同源的分类和更新进度可能不同。</p>
        </header>

        {sources.length === 0 ? (
          <EmptyState icon="search" title="没有可用的点播源" description="请在设置中勾选可用的点播源，再返回分类页面。" />
        ) : (
          <>
            <div className="card p-4 mb-6">
              <label className="block text-sm text-muted mb-2" htmlFor="browse-source">点播源</label>
              <select
                id="browse-source"
                className="input w-full sm:max-w-sm"
                value={source.key}
                onChange={(event) => navigate(event.target.value)}
              >
                {sources.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
              </select>
            </div>

            {categoriesQuery.isPending ? (
              <p className="text-sm text-muted py-10">正在加载分类…</p>
            ) : categoriesQuery.isError ? (
              <div className="card p-5 text-sm text-muted">
                <p>分类加载失败：{categoriesQuery.error.message}</p>
                <button className="btn-ghost btn-sm mt-3" onClick={() => void categoriesQuery.refetch()}>重试</button>
              </div>
            ) : roots.length === 0 ? (
              <EmptyState icon="search" title="该点播源暂无分类" description="请切换其他点播源。" />
            ) : (
              <>
                <nav aria-label="影视大类" className="flex flex-wrap gap-2 mb-4">
                  {roots.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn('btn-ghost btn-sm', root?.id === item.id && '!bg-accent !text-white')}
                      aria-current={root?.id === item.id ? 'page' : undefined}
                      onClick={() => chooseRoot(item)}
                    >{item.name}</button>
                  ))}
                </nav>
                {children.length > 0 && (
                  <nav aria-label="细分类" className="flex flex-wrap gap-2 mb-6">
                    {children.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={cn('px-3 py-1.5 rounded-lg text-sm transition-colors', category?.id === item.id
                          ? 'bg-accent/15 text-accent font-medium'
                          : 'bg-chip text-muted hover:text-content hover:bg-hover')}
                        aria-current={category?.id === item.id ? 'page' : undefined}
                        onClick={() => navigate(source.key, item.id)}
                      >{item.name}</button>
                    ))}
                  </nav>
                )}

                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="font-semibold text-content">{root?.name}{children.length > 0 ? ` / ${category?.name}` : ''}</h2>
                  {browseQuery.data && <span className="text-xs text-faint">第 {page} / {Math.max(1, browseQuery.data.pageCount)} 页 · 共 {browseQuery.data.total} 条</span>}
                </div>

                {browseQuery.isPending ? (
                  <p className="text-sm text-muted py-10">正在加载影片…</p>
                ) : browseQuery.isError ? (
                  <div className="card p-5 text-sm text-muted">
                    <p>影片加载失败：{browseQuery.error.message}</p>
                    <button className="btn-ghost btn-sm mt-3" onClick={() => void browseQuery.refetch()}>重试</button>
                  </div>
                ) : browseQuery.data.list.length === 0 ? (
                  <EmptyState icon="search" title="此分类暂无影片" description="可以切换细分类或点播源。" />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
                    {browseQuery.data.list.map((item) => (
                      <VideoCard key={`${item.sourceKey}_${item.vodId}`} item={item} onClick={() => setDetailItem(item)} />
                    ))}
                  </div>
                )}

                {browseQuery.data && browseQuery.data.pageCount > 1 && (
                  <nav aria-label="分类分页" className="flex items-center justify-center gap-4 mt-7">
                    <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => navigate(source.key, category.id, page - 1)}>上一页</button>
                    <span className="text-sm text-muted">{page} / {browseQuery.data.pageCount}</span>
                    <button className="btn-ghost btn-sm" disabled={page >= Math.min(browseQuery.data.pageCount, 10000)} onClick={() => navigate(source.key, category.id, page + 1)}>下一页</button>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </main>
      <SiteFooter />
      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}
