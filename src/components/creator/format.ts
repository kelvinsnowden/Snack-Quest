export function formatKes(amountKes: number): string {
  return `KSh ${Math.round(amountKes || 0).toLocaleString()}`;
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

export function conversionRate(clicks: number, conversions: number): string {
  if (!clicks) return '0';
  return ((conversions / clicks) * 100).toFixed(1);
}
