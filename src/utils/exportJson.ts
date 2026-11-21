export function downloadJsonFile(filename: string, data: unknown): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
}
