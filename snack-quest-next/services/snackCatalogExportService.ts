import 'server-only';

import { recipeService } from '@/services/recipeService';
import { storageService } from '@/services/storageService';
import { csvCell } from '@/services/vendingSalesService';
import { ALLERGEN_LABEL } from '@/lib/products/productDetails';
import { createZipStream, type ZipEntry } from '@/lib/storage/zip';
import type { StorageListObject } from '@/lib/integrations/types';
import type { SnackItem } from '@/types/snackItem';

/**
 * The snack catalogue as one download (§ Admin: Snacks): every snack
 * photo in this business's `snacks/` storage, plus `catalog.csv` and an
 * offline `index.html` gallery, zipped.
 *
 * Driven by the storage listing, not by `imageUrl` alone, so the bundle
 * really is "every snack image in storage": a photo no snack points at
 * any more still goes in, under `images/unlinked/`. And only URLs that
 * listing returned are ever fetched — a snack's `imageUrl` is just a
 * stored string, and fetching whatever it holds would let a bad value
 * make the server request an arbitrary URL.
 */

export interface SnackCatalogExportOptions {
  /** Whether the expected unit cost column is filled — same `products.cost.view` rule as the Snacks page. */
  showCost: boolean;
}

export interface SnackCatalogExport {
  stream: ReadableStream<Uint8Array>;
  filename: string;
  snackCount: number;
  imageCount: number;
}

interface CatalogRow {
  id: string;
  item: SnackItem;
  /** Path inside the zip, or null when the snack has no photo in storage. */
  imagePath: string | null;
  imageUrl: string | null;
}

const LIST_PAGE_SIZE = 1000;

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 60) || 'snack';
}

function extensionOf(pathname: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(pathname);
  return match ? `.${match[1].toLowerCase()}` : '';
}

/** The original filename `storageService` uploaded under, minus the UUID it prefixes. */
function originalFilename(pathname: string): string {
  const base = pathname.split('/').pop() ?? 'file';
  return base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '') || base;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function netContentLabel(item: SnackItem): string {
  return item.netContent ? `${item.netContent.amount}${item.netContent.unit}` : '';
}

function allergensLabel(item: SnackItem): string {
  if (item.allergens === undefined || item.allergens === null) return '';
  if (item.allergens.length === 0) return 'None declared';
  return item.allergens.map((allergen) => ALLERGEN_LABEL[allergen]).join('; ');
}

function buildCsv(rows: CatalogRow[], showCost: boolean): string {
  const header = [
    'Name',
    'Brand',
    'Origin',
    'Description',
    'Unit',
    'Net content',
    'Allergens',
    'Barcode',
    'Active',
    'Premium pick',
    'Stock',
    ...(showCost ? ['Expected unit cost (KES)'] : []),
    'Image file',
    'Image URL',
  ];
  const lines = rows.map(({ id, item, imagePath, imageUrl }) => [
    item.name,
    item.brand ?? '',
    item.origin ?? '',
    item.description ?? '',
    item.unitLabel,
    netContentLabel(item),
    allergensLabel(item),
    item.barcode ?? '',
    item.isActive ? 'Yes' : 'No',
    item.availableForPremiumSelection ? 'Yes' : 'No',
    item.stockCount === undefined ? '' : String(item.stockCount),
    ...(showCost ? [item.costPending ? '' : String(item.expectedUnitCostKes)] : []),
    imagePath ?? (item.imageUrl ? `Missing — not in this download (snack ${id})` : ''),
    imageUrl ?? '',
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function buildIndexHtml(rows: CatalogRow[], unlinked: string[], generatedAt: Date): string {
  const cards = rows
    .map(({ item, imagePath }) => {
      const details = [item.brand, item.origin, netContentLabel(item)].filter(Boolean).join(' · ');
      const allergens = allergensLabel(item);
      return `<article>
  ${imagePath ? `<img src="${escapeHtml(imagePath)}" alt="${escapeHtml(item.name)}" loading="lazy">` : '<div class="placeholder">No photo</div>'}
  <h2>${escapeHtml(item.name)}${item.isActive ? '' : ' <span class="tag">Inactive</span>'}</h2>
  ${details ? `<p class="meta">${escapeHtml(details)}</p>` : ''}
  ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
  ${allergens ? `<p class="meta">Allergens: ${escapeHtml(allergens)}</p>` : ''}
</article>`;
    })
    .join('\n');
  const extras = unlinked.length
    ? `<h2 class="section">Photos not linked to a snack</h2>
<div class="grid">${unlinked.map((path) => `<article><img src="${escapeHtml(path)}" alt="" loading="lazy"><p class="meta">${escapeHtml(path.split('/').pop() ?? '')}</p></article>`).join('\n')}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Snack Quest catalog</title>
<style>
  body { margin: 0; padding: 24px 16px; font-family: system-ui, sans-serif; background: #faf8f5; color: #1f1b16; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  .sub { margin: 0 0 24px; color: #6b6259; font-size: 14px; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  article { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); padding-bottom: 12px; }
  article img, .placeholder { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; background: #eee9e2; }
  .placeholder { display: flex; align-items: center; justify-content: center; color: #8a8178; font-size: 14px; }
  article h2 { font-size: 16px; margin: 12px 12px 4px; }
  article p { font-size: 13px; margin: 4px 12px; line-height: 1.4; }
  .meta { color: #6b6259; }
  .tag { font-size: 11px; font-weight: 500; color: #8a5a00; background: #fff1d6; border-radius: 999px; padding: 2px 8px; }
  .section { margin: 32px 0 16px; font-size: 20px; }
</style>
</head>
<body>
<h1>Snack Quest catalog</h1>
<p class="sub">${rows.length} snacks · exported ${escapeHtml(generatedAt.toISOString().slice(0, 10))}</p>
<div class="grid">
${cards}
</div>
${extras}
</body>
</html>
`;
}

class SnackCatalogExportService {
  private async listAllSnackImages(businessId: string): Promise<StorageListObject[]> {
    const objects: StorageListObject[] = [];
    let cursor: string | undefined;
    do {
      const page = await storageService.listFiles(businessId, 'snacks', { cursor, limit: LIST_PAGE_SIZE });
      objects.push(...page.objects);
      cursor = page.cursor ?? undefined;
    } while (cursor);
    return objects;
  }

  async export(businessId: string, options: SnackCatalogExportOptions): Promise<SnackCatalogExport> {
    const [items, stored] = await Promise.all([
      recipeService.listSnackItems(businessId),
      this.listAllSnackImages(businessId),
    ]);

    const storedByUrl = new Map(stored.map((object) => [object.url, object]));
    const usedNames = new Set<string>();
    const uniqueName = (candidate: string): string => {
      let name = candidate;
      for (let n = 2; usedNames.has(name); n++) {
        const ext = extensionOf(candidate);
        name = `${candidate.slice(0, candidate.length - ext.length)}-${n}${ext}`;
      }
      usedNames.add(name);
      return name;
    };

    const linkedUrls = new Set<string>();
    const rows: CatalogRow[] = items.map(({ id, data }) => {
      const object = data.imageUrl ? storedByUrl.get(data.imageUrl) : undefined;
      if (!object) return { id, item: data, imagePath: null, imageUrl: null };
      linkedUrls.add(object.url);
      return {
        id,
        item: data,
        imagePath: uniqueName(`images/${slugify(data.name)}${extensionOf(object.pathname)}`),
        imageUrl: object.url,
      };
    });
    const unlinked = stored
      .filter((object) => !linkedUrls.has(object.url))
      .map((object) => ({ object, path: uniqueName(`images/unlinked/${originalFilename(object.pathname)}`) }));

    const downloads = [
      ...rows.flatMap((row) => (row.imagePath && row.imageUrl ? [{ path: row.imagePath, url: row.imageUrl, row }] : [])),
      ...unlinked.map(({ object, path }) => ({ path, url: object.url, row: null as CatalogRow | null })),
    ];
    const generatedAt = new Date();
    const failedPaths = new Set<string>();

    async function* entries(): AsyncGenerator<ZipEntry> {
      for (const download of downloads) {
        let data: Uint8Array;
        try {
          const response = await fetch(download.url, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          data = new Uint8Array(await response.arrayBuffer());
        } catch {
          // One unreadable photo shouldn't sink the whole download — it is
          // left out and the CSV says so instead.
          failedPaths.add(download.path);
          if (download.row) download.row.imagePath = null;
          continue;
        }
        yield { name: download.path, data, modifiedAt: generatedAt };
      }

      const encoder = new TextEncoder();
      yield {
        name: 'catalog.csv',
        // BOM so Excel opens non-ASCII names correctly.
        data: encoder.encode('﻿' + buildCsv(rows, options.showCost)),
        modifiedAt: generatedAt,
      };
      yield {
        name: 'index.html',
        data: encoder.encode(
          buildIndexHtml(
            rows,
            unlinked.map(({ path }) => path).filter((path) => !failedPaths.has(path)),
            generatedAt,
          ),
        ),
        modifiedAt: generatedAt,
      };
    }

    return {
      stream: createZipStream(entries()),
      filename: `snack-catalog-${generatedAt.toISOString().slice(0, 10)}.zip`,
      snackCount: rows.length,
      imageCount: downloads.length,
    };
  }
}

export const snackCatalogExportService = new SnackCatalogExportService();
export { SnackCatalogExportService };
