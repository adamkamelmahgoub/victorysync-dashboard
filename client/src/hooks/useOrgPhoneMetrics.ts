import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface OrgMetrics {
  callsToday: number;
  answeredCalls: number;
  missedCalls: number;
  answerRate: number; // 0-100
  avgHandleTime: number; // seconds
  avgSpeedOfAnswer: number; // seconds
}

interface MetricsResponse {
  callsToday: number;
  answeredCalls: number;
  missedCalls: number;
  answerRate: number;
  avgHandleTime: number;
  avgSpeedOfAnswer: number;
}

export function useOrgPhoneMetrics(orgId: string | null, daysBack: number = 1) {
  const [data, setData] = useState<OrgMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setIsLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Use 30s timeout to prevent indefinite loading if Supabase is slow
        // Supabase queries can take a while on large datasets, so we give it ample time
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Metrics query timed out (30s). Check your internet connection or try again.')), 30000)
        );

        const metricsPromise = (async () => {
          // First get phone numbers assigned to this org
          const { data: orgPhones, error: phonesErr } = await supabase
            .from('org_phone_numbers')
            .select('phone_number_id')
            .eq('org_id', orgId);

          if (phonesErr) throw phonesErr;

          const phoneIds = (orgPhones?.map(p => p.phone_number_id).filter(Boolean)) || [];

          if (!phoneIds || phoneIds.length === 0) {
            return {
              callsToday: 0,
              answeredCalls: 0,
              missedCalls: 0,
              answerRate: 0,
              avgHandleTime: 0,
              avgSpeedOfAnswer: 0,
            };
          }

          // Get phone_numbers with their number_digits
          const { data: phones, error: phoneDetailsErr } = await supabase
            .from('phone_numbers')
            .select('number_digits')
            .in('id', phoneIds);

          if (phoneDetailsErr) throw phoneDetailsErr;

          const numberDigits = phones?.map(p => p.number_digits).filter(Boolean) || [];

          if (numberDigits.length === 0) {
            return {
              callsToday: 0,
              answeredCalls: 0,
              missedCalls: 0,
              answerRate: 0,
              avgHandleTime: 0,
              avgSpeedOfAnswer: 0,
            };
          }

          // Query calls table for metrics
          // Using a date calculation for flexibility
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - daysBack);
          const startDateStr = startDate.toISOString().split('T')[0];

          const { data: callsData, error: callsErr } = await supabase
            .from('calls')
            .select('id, is_answered, duration, speed_of_answer')
            .in('number_digits', numberDigits)
            .gte('created_at', startDateStr)
            .eq('call_date', new Date().toISOString().split('T')[0]); // Only today for "callsToday"

          if (callsErr) throw callsErr;

          const calls = callsData || [];
          const callsToday = calls.length;
          const answeredCalls = calls.filter(c => c.is_answered).length;
          const missedCalls = callsToday - answeredCalls;
          const answerRate = callsToday > 0 ? (answeredCalls / callsToday) * 100 : 0;

          const validDurations = calls
            .filter(c => c.duration && typeof c.duration === 'number')
            .map(c => c.duration as number);
          const avgHandleTime = validDurations.length > 0
            ? validDurations.reduce((a, b) => a + b, 0) / validDurations.length
            : 0;

          const validSpeeds = calls
            .filter(c => c.speed_of_answer && typeof c.speed_of_answer === 'number')
            .map(c => c.speed_of_answer as number);
          const avgSpeedOfAnswer = validSpeeds.length > 0
            ? validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length
            : 0;

          return {
            callsToday,
            answeredCalls,
            missedCalls,
            answerRate: Math.round(answerRate * 100) / 100,
            avgHandleTime: Math.round(avgHandleTime),
            avgSpeedOfAnswer: Math.round(avgSpeedOfAnswer),
          };
        })();

        // Race against timeout
        const result = await Promise.race([metricsPromise, timeoutPromise]);
        setData(result);
      } catch (err: any) {
        console.error('Failed to fetch org metrics:', err);
        setError(err?.message || 'Failed to fetch metrics');
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [orgId, daysBack]);

  return { data, isLoading, error };
}
