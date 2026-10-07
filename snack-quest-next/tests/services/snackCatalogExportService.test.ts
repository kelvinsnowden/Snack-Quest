import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listSnackItemsMock, listFilesMock } = vi.hoisted(() => ({
  listSnackItemsMock: vi.fn(),
  listFilesMock: vi.fn(),
}));

vi.mock('@/services/recipeService', () => ({
  recipeService: { listSnackItems: listSnackItemsMock },
}));
vi.mock('@/services/storageService', () => ({
  storageService: { listFiles: listFilesMock },
}));

import { SnackCatalogExportService } from '@/services/snackCatalogExportService';
import { collectStream, readZip } from '@/tests/helpers/readZip';

const BASE = 'https://store.public.blob.vercel-storage.com';
const POCKY_URL = `${BASE}/snacks/biz-1/11111111-1111-1111-1111-111111111111-pocky.jpg`;
const CHIPS_URL = `${BASE}/snacks/biz-1/22222222-2222-2222-2222-222222222222-chips.png`;
const STRAY_URL = `${BASE}/snacks/biz-1/33333333-3333-3333-3333-333333333333-old-photo.webp`;

function snack(overrides: Record<string, unknown>) {
  return {
    businessId: 'biz-1',
    name: 'Snack',
    imageUrl: null,
    expectedUnitCostKes: 120,
    unitLabel: 'bag',
    origin: null,
    sourcingNote: 'Diamond Plaza',
    isActive: true,
    ...overrides,
  };
}

describe('SnackCatalogExportService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: string) => new Response(new TextEncoder().encode(`bytes of ${url}`)));
    listSnackItemsMock.mockResolvedValue([
      { id: 'a', data: snack({ name: 'Pocky Matcha 抹茶', imageUrl: POCKY_URL, origin: 'Japan', allergens: ['milk', 'gluten'] }) },
      { id: 'b', data: snack({ name: 'Shrimp Chips', imageUrl: CHIPS_URL, costPending: true }) },
      { id: 'c', data: snack({ name: '=HYPERLINK("x")', imageUrl: 'https://evil.example/x.png' }) },
    ]);
    listFilesMock
      .mockResolvedValueOnce({ objects: [{ url: POCKY_URL, pathname: new URL(POCKY_URL).pathname.slice(1), size: 1, uploadedAt: '' }], cursor: 'next' })
      .mockResolvedValueOnce({
        objects: [
          { url: CHIPS_URL, pathname: new URL(CHIPS_URL).pathname.slice(1), size: 1, uploadedAt: '' },
          { url: STRAY_URL, pathname: new URL(STRAY_URL).pathname.slice(1), size: 1, uploadedAt: '' },
        ],
        cursor: null,
      });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('zips every stored snack photo with a CSV and gallery, fetching only listed URLs', async () => {
    const result = await new SnackCatalogExportService().export('biz-1', { showCost: true });
    const files = readZip(await collectStream(result.stream));

    expect(listFilesMock).toHaveBeenCalledWith('biz-1', 'snacks', expect.objectContaining({ cursor: 'next' }));
    expect([...files.keys()]).toEqual([
      'images/pocky-matcha.jpg',
      'images/shrimp-chips.png',
      'images/unlinked/old-photo.webp',
      'catalog.csv',
      'index.html',
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([POCKY_URL, CHIPS_URL, STRAY_URL]);
    expect(new TextDecoder().decode(files.get('images/pocky-matcha.jpg'))).toBe(`bytes of ${POCKY_URL}`);
    expect(result).toMatchObject({ snackCount: 3, imageCount: 3 });

    const csv = new TextDecoder().decode(files.get('catalog.csv'));
    expect(csv).toContain('Expected unit cost (KES)');
    expect(csv).toContain('Pocky Matcha 抹茶,,Japan,,bag,,Milk; Gluten,');
    expect(csv).toContain(`images/pocky-matcha.jpg,${POCKY_URL}`);
    // Cost pending → blank, not a misleading 120.
    expect(csv).toMatch(/Shrimp Chips,.*,No,,,images\/shrimp-chips\.png/);
    // Formula neutralised; a URL outside storage is reported, not fetched.
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('Missing — not in this download (snack c)');
    expect(csv).not.toContain('Diamond Plaza');

    const html = new TextDecoder().decode(files.get('index.html'));
    expect(html).toContain('src="images/pocky-matcha.jpg"');
    expect(html).toContain('=HYPERLINK(&quot;x&quot;)');
  });

  it('leaves cost out without products.cost.view', async () => {
    const result = await new SnackCatalogExportService().export('biz-1', { showCost: false });
    const csv = new TextDecoder().decode(readZip(await collectStream(result.stream)).get('catalog.csv'));
    expect(csv).not.toContain('Expected unit cost');
    expect(csv).not.toContain('120');
  });

  it('skips a photo that fails to download and says so in the CSV', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === CHIPS_URL ? new Response('gone', { status: 404 }) : new Response('ok'),
    );
    const result = await new SnackCatalogExportService().export('biz-1', { showCost: false });
    const files = readZip(await collectStream(result.stream));

    expect(files.has('images/shrimp-chips.png')).toBe(false);
    const csv = new TextDecoder().decode(files.get('catalog.csv'));
    expect(csv).toContain('Missing — not in this download (snack b)');
  });
});
