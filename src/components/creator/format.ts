export function formatKes(amountKes: number): string {
  return `KSh ${Math.round(amountKes || 0).toLocaleString()}`;
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}
