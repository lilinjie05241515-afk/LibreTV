import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickSaveTarget } from './download-saver';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('浏览器内存保存目标', () => {
  it('只保存 Uint8Array 子视图对应的字节', async () => {
    let savedBlob: Blob | undefined;
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      createElement: () => ({ href: '', download: '', click: () => {}, remove: () => {} }),
      body: { appendChild: () => {} },
    });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      savedBlob = blob as Blob;
      return 'blob:test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>);

    const target = await pickSaveTarget('episode.ts');
    const backing = new Uint8Array([99, 1, 2, 88]);
    await target.write(backing.subarray(1, 3));
    await target.close();

    expect(savedBlob).toBeDefined();
    expect(Array.from(new Uint8Array(await savedBlob!.arrayBuffer()))).toEqual([1, 2]);
  });
});
