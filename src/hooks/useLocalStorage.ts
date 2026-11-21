import { useEffect, useState } from 'react';

function matchesShape<T>(parsed: unknown, fallback: T): parsed is T {
  if (fallback === null || fallback === undefined) {
    return parsed === null || (typeof parsed === 'object' && !Array.isArray(parsed));
  }
  if (Array.isArray(fallback)) {
    return Array.isArray(parsed);
  }
  if (typeof fallback === 'object') {
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  }
  return typeof parsed === typeof fallback;
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        const parsed: unknown = JSON.parse(item);
        if (matchesShape(parsed, initialValue)) {
          return parsed;
        }
      }
    } catch {
      // Fallback to initial value when localStorage is blocked or corrupted
    }
    return initialValue;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {
      // Ignore storage quota errors
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}
