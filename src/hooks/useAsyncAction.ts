import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncActionState {
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  clearError: () => void;
  run: <T>(operation: () => Promise<T>, fallbackErrorMessage?: string) => Promise<T | null>;
}

/**
 * Shared async execution hook with unmount protection and latest-request guards
 * so concurrent triggers or slow responses never overwrite newer state.
 */
export function useAsyncAction(defaultErrorMessage = 'Request failed.'): AsyncActionState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const run = useCallback(
    async <T,>(
      operation: () => Promise<T>,
      fallbackErrorMessage?: string
    ): Promise<T | null> => {
      const seq = ++seqRef.current;
      setLoading(true);
      setError(null);
      try {
        const result = await operation();
        return result;
      } catch (err) {
        if (mountedRef.current && seq === seqRef.current) {
          setError(
            err instanceof Error
              ? err.message
              : fallbackErrorMessage ?? defaultErrorMessage
          );
        }
        return null;
      } finally {
        if (mountedRef.current && seq === seqRef.current) {
          setLoading(false);
        }
      }
    },
    [defaultErrorMessage]
  );

  return { loading, error, setError, clearError, run };
}
