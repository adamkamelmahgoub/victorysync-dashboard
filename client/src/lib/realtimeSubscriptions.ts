import { useEffect } from 'react';
import { supabase } from './supabaseClient';

/**
 * Hook to subscribe to realtime updates from a Supabase table
 * Automatically unsubscribes when component unmounts
 */
export function useRealtimeSubscription(
  tableName: string,
  orgId: string | null | undefined,
  onInsert?: (data: any) => void,
  onUpdate?: (data: any) => void,
  onDelete?: (data: any) => void
) {
  useEffect(() => {
    if (!orgId) return;

    // Subscribe to realtime changes on the table filtered by org_id
    const subscription = supabase
      .channel(`${tableName}:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: tableName,
          filter: `org_id=eq.${orgId}`
        },
        (payload) => {
          console.log(`[Realtime] ${tableName} INSERT:`, payload.new);
          onInsert?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: tableName,
          filter: `org_id=eq.${orgId}`
        },
        (payload) => {
          console.log(`[Realtime] ${tableName} UPDATE:`, payload.new);
          onUpdate?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: tableName,
          filter: `org_id=eq.${orgId}`
        },
        (payload) => {
          console.log(`[Realtime] ${tableName} DELETE:`, payload.old);
          onDelete?.(payload.old);
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] ${tableName} subscription status:`, status);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [tableName, orgId, onInsert, onUpdate, onDelete]);
}

/**
 * Hook to subscribe to multiple tables at once
 */
export function useRealtimeMultiSubscription(
  orgId: string | null | undefined,
  tables: string[],
  onDataChange?: (table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', data: any) => void
) {
  useEffect(() => {
    if (!orgId || tables.length === 0) return;

    // Create a channel for this org
    let channel = supabase.channel(`org:${orgId}`);

    // Add listeners for each table
    tables.forEach((table) => {
      channel = channel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: table,
            filter: `org_id=eq.${orgId}`
          },
          (payload) => {
            console.log(`[Realtime] ${table} INSERT`);
            onDataChange?.(table, 'INSERT', payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: table,
            filter: `org_id=eq.${orgId}`
          },
          (payload) => {
            console.log(`[Realtime] ${table} UPDATE`);
            onDataChange?.(table, 'UPDATE', payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: table,
            filter: `org_id=eq.${orgId}`
          },
          (payload) => {
            console.log(`[Realtime] ${table} DELETE`);
            onDataChange?.(table, 'DELETE', payload.old);
          }
        );
    });

    channel.subscribe((status) => {
      console.log(`[Realtime] Multi-table subscription status:`, status);
    });

    return () => {
      channel.unsubscribe();
    };
  }, [orgId, tables.join(','), onDataChange]);
}
