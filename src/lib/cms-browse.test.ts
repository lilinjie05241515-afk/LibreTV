import { describe, expect, it } from 'vitest';
import { parseBrowseList, parseBrowseSource, parseCategoryList } from './cms-browse';

const source = { key: 'env_0', name: '测试源', url: 'https://cms.example.com/api.php/provide/vod' };

describe('Apple CMS 分类数据', () => {
  it('保留源站分类层级，并在过滤模式下移除成人分类及其子类', () => {
    const data = { class: [
      { type_id: 1, type_pid: 0, type_name: '电影片' },
      { type_id: '6', type_pid: '1', type_name: '动作片' },
      { type_id: 90, type_pid: 0, type_name: '伦理片' },
      { type_id: 91, type_pid: 90, type_name: '专题' },
      { type_id: 6, type_pid: 1, type_name: '重复' },
      { type_id: 'bad', type_pid: 0, type_name: '无效' },
    ] };
    expect(parseCategoryList(data, true)).toEqual([
      { id: '1', parentId: '0', name: '电影片' },
      { id: '6', parentId: '1', name: '动作片' },
    ]);
    expect(parseCategoryList(data, false)).toHaveLength(4);
  });

  it('拒绝没有分类目录的非 CMS 响应', () => {
    expect(() => parseCategoryList({ list: [] }, true)).toThrow('源站没有提供可用分类');
  });

  it('解析分类影片和分页信息，保留详情所需的源地址', () => {
    const page = parseBrowseList({
      page: '2', pagecount: '12', total: '225',
      list: [
        { vod_id: 10, vod_name: '普通电影', type_name: '动作片' },
        { vod_id: 11, vod_name: '成人电影', type_name: '伦理片' },
      ],
    }, source, true);
    expect(page).toMatchObject({ page: 2, pageCount: 12, total: 225 });
    expect(page.list).toHaveLength(1);
    expect(page.list[0]).toMatchObject({ name: '普通电影', vodId: '10', sourceUrl: source.url });
  });

  it('仅接受有限长度的 HTTP(S) 点播源配置', () => {
    expect(parseBrowseSource(JSON.stringify(source))).toMatchObject(source);
    expect(parseBrowseSource(JSON.stringify({ ...source, url: 'file:///etc/passwd' }))).toBeNull();
    expect(parseBrowseSource('{bad')).toBeNull();
  });
});
