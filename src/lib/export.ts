import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export function exportToCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows || !rows.length) return;
  
  // Format objects or arrays to JSON strings if nested
  const sanitizedRows = rows.map((row) => {
    const cleanRow: Record<string, any> = {};
    Object.keys(row).forEach((key) => {
      const val = row[key];
      if (typeof val === 'object' && val !== null) {
        cleanRow[key] = JSON.stringify(val);
      } else {
        cleanRow[key] = val;
      }
    });
    return cleanRow;
  });

  const csv = Papa.unparse(sanitizedRows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToXlsx(filename: string, rows: Record<string, any>[]) {
  if (!rows || !rows.length) return;

  const sanitizedRows = rows.map((row) => {
    const cleanRow: Record<string, any> = {};
    Object.keys(row).forEach((key) => {
      const val = row[key];
      if (typeof val === 'object' && val !== null) {
        cleanRow[key] = JSON.stringify(val);
      } else {
        cleanRow[key] = val;
      }
    });
    return cleanRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(sanitizedRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
