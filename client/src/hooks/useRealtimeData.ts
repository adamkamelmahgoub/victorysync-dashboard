import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

interface SubscriptionOptions {
  table: string;
  filter?: string;
  onInsert?: (data: any) => void;
  onUpdate?: (data: any) => void;
  onDelete?: (data: any) => void;
}

export function useRealtimeData<T>(options: SubscriptionOptions) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const subscription = supabase
      .channel(`${options.table}:${options.filter || '*'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: options.table,
        },
        (payload) => {
          console.log('[Realtime] INSERT', options.table, payload.new);
          setData((prev) => [...prev, payload.new as T]);
          options.onInsert?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: options.table,
        },
        (payload) => {
          console.log('[Realtime] UPDATE', options.table, payload.new);
          setData((prev) =>
            prev.map((item: any) =>
              item.id === payload.new.id ? (payload.new as T) : item
            )
          );
          options.onUpdate?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: options.table,
        },
        (payload) => {
          console.log('[Realtime] DELETE', options.table, payload.old);
          setData((prev) =>
            prev.filter((item: any) => item.id !== payload.old.id)
          );
          options.onDelete?.(payload.old);
        }
      )
      .subscribe();

    setLoading(false);

    return () => {
      subscription.unsubscribe();
    };
  }, [options.table, options.filter]);

  return { data, loading, error };
}
