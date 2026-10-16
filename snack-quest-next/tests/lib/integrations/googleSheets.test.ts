import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { gridToRows } from '@/lib/integrations/googleSheets';

describe('gridToRows', () => {
  it('keys each row by the header row', () => {
    expect(
      gridToRows([
        ['id', 'full_name', 'phone_number'],
        ['l:1', 'Amina', '+254700000001'],
      ]),
    ).toEqual([{ id: 'l:1', full_name: 'Amina', phone_number: '+254700000001' }]);
  });

  it('fills cells missing at the end of a short row with empty strings', () => {
    expect(gridToRows([['id', 'email'], ['l:2']])).toEqual([{ id: 'l:2', email: '' }]);
  });

  it('drops blank rows and blank header columns', () => {
    expect(
      gridToRows([
        ['id', '', 'name'],
        ['', '', ''],
        ['l:3', 'ignored', 'Otieno'],
      ]),
    ).toEqual([{ id: 'l:3', name: 'Otieno' }]);
  });

  it('returns nothing for an empty sheet', () => {
    expect(gridToRows([])).toEqual([]);
  });
});
