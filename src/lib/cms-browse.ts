import { filterAdultResults, isAdultContent, parseSearchList } from './cms-parser';
import type { BrowseResponse, CmsCategory, SourceConfig } from './types';

/** 分类页只接受普通 Apple CMS API 地址，不使用源配置里的详情页地址。 */
export function parseBrowseSource(raw: string | null): SourceConfig | null {
  if (!raw || raw.length > 2400) return null;
  try {
    const value = JSON.parse(raw) as Partial<SourceConfig>;
    if (
      !value || typeof value.key !== 'string' || !value.key || value.key.length > 100 ||
      typeof value.name !== 'string' || !value.name || value.name.length > 100 ||
      typeof value.url !== 'string' || value.url.length > 2048 || !/^https?:\/\//i.test(value.url)
    ) return null;
    return { key: value.key, name: value.name, url: value.url, isAdult: value.isAdult === true };
  } catch {
    return null;
  }
}

export function parseCategoryList(data: unknown, filterAdult: boolean): CmsCategory[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { class?: unknown }).class)) {
    throw new Error('源站没有提供可用分类');
  }
  const seen = new Set<string>();
  const categories: CmsCategory[] = [];
  for (const raw of (data as { class: unknown[] }).class) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const id = String(item.type_id ?? '');
    const parentId = String(item.type_pid ?? '0');
    const name = typeof item.type_name === 'string' ? item.type_name.trim() : '';
    if (!/^\d{1,12}$/.test(id) || id === '0' || !/^\d{1,12}$/.test(parentId) || !name || name.length > 80 || seen.has(id)) continue;
    seen.add(id);
    categories.push({ id, parentId, name });
  }
  if (!filterAdult) return categories;
  const blocked = new Set(categories.filter((item) => isAdultContent(item.name)).map((item) => item.id));
  // 成人分类的子分类即便名称不含关键词，也不应出现在过滤模式下。
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of categories) {
      if (blocked.has(item.parentId) && !blocked.has(item.id)) {
        blocked.add(item.id);
        changed = true;
      }
    }
  }
  return categories.filter((item) => !blocked.has(item.id));
}

function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function parseBrowseList(data: unknown, source: SourceConfig, filterAdult: boolean): BrowseResponse {
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const list = parseSearchList(data, source);
  return {
    list: filterAdultResults(list, filterAdult),
    page: positiveNumber(record.page) || 1,
    pageCount: positiveNumber(record.pagecount),
    total: positiveNumber(record.total),
  };
}
