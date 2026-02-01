import { buildApiUrl } from '../config';
import type { QueryResult, MightyCallReport, MightyCallRecording, DatabaseError } from './types';

/**
 * Get reports for an organization
 */
export async function getReports(
  orgId: string,
  reportType?: string,
  limit = 100,
  offset = 0
): Promise<QueryResult<MightyCallReport>> {
  try {
    const url = new URL(buildApiUrl('/api/admin/reports'));
    url.searchParams.append('org_id', orgId);
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());
    if (reportType) url.searchParams.append('report_type', reportType);
    
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.reports || [], error: null, count: json.count || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get recordings for an organization
 */
export async function getRecordings(
  orgId: string,
  phoneNumberId?: string,
  limit = 50,
  offset = 0
): Promise<QueryResult<MightyCallRecording & { phone_numbers?: { number: string; label: string | null } }>> {
  try {
    const url = new URL(buildApiUrl('/api/admin/recordings'));
    url.searchParams.append('org_id', orgId);
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());
    if (phoneNumberId) url.searchParams.append('phone_number_id', phoneNumberId);
    
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.recordings || [], error: null, count: json.count || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get recordings for a specific date range
 */
export async function getRecordingsByDateRange(
  orgId: string,
  startDate: string,
  endDate: string,
  phoneNumberId?: string,
  limit = 100
): Promise<QueryResult<MightyCallRecording & { phone_numbers?: { number: string; label: string | null } }>> {
  try {
    const url = new URL(buildApiUrl('/api/admin/recordings'));
    url.searchParams.append('org_id', orgId);
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    url.searchParams.append('limit', limit.toString());
    if (phoneNumberId) url.searchParams.append('phone_number_id', phoneNumberId);
    
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.recordings || [], error: null, count: json.count || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get call metrics summary for an organization
 */
export async function getCallMetricsSummary(
  orgId: string,
  startDate: string,
  endDate: string
): Promise<{
  total_calls: number;
  answered_calls: number;
  avg_wait_seconds: number;
  avg_duration_seconds: number;
  sla_percentage: number;
} | null> {
  try {
    const url = new URL(buildApiUrl('/api/admin/metrics/summary'));
    url.searchParams.append('org_id', orgId);
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = await response.json();
    return json.summary || null;
  } catch (err) {
    console.error('Error getting call metrics summary:', err);
    return null;
  }
}

/**
 * Get call volume over time for charts
 */
export async function getCallVolumeOverTime(
  orgId: string,
  startDate: string,
  endDate: string,
  groupBy: 'hour' | 'day' | 'week' | 'month' = 'day'
): Promise<Array<{
  period: string;
  total_calls: number;
  answered_calls: number;
  avg_wait_seconds: number;
}> | null> {
  try {
    const url = new URL(buildApiUrl('/api/admin/metrics/volume'));
    url.searchParams.append('org_id', orgId);
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    url.searchParams.append('group_by', groupBy);
    
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = await response.json();
    return json.data || [];
  } catch (err) {
    console.error('Error getting call volume over time:', err);
    return null;
  }
}

/**
 * Get agent performance metrics
 */
export async function getAgentPerformanceMetrics(
  orgId: string,
  startDate: string,
  endDate: string
): Promise<Array<{
  extension: string;
  agent_name: string;
  total_calls: number;
  answered_calls: number;
  avg_duration_seconds: number;
  avg_wait_seconds: number;
}> | null> {
  try {
    const url = new URL(buildApiUrl('/api/admin/metrics/agents'));
    url.searchParams.append('org_id', orgId);
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = await response.json();
    return json.data || [];
  } catch (err) {
    console.error('Error getting agent performance metrics:', err);
    return null;
  }
}

/**
 * Get phone number performance metrics
 */
export async function getPhoneNumberPerformanceMetrics(
  orgId: string,
  startDate: string,
  endDate: string
): Promise<Array<{
  phone_number: string;
  label: string | null;
  total_calls: number;
  answered_calls: number;
  avg_wait_seconds: number;
  avg_duration_seconds: number;
}> | null> {
  try {
    const url = new URL(buildApiUrl('/api/admin/metrics/phones'));
    url.searchParams.append('org_id', orgId);
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = await response.json();
    return json.data || [];
  } catch (err) {
    console.error('Error getting phone number performance metrics:', err);
    return null;
  }
}

/**
 * Create a report record
 */
export async function createReport(
  report: Omit<MightyCallReport, 'id' | 'created_at' | 'updated_at'>
): Promise<QueryResult<MightyCallReport>> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/reports'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.report], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Create a recording record
 */
export async function createRecording(
  recording: Omit<MightyCallRecording, 'id' | 'created_at'>
): Promise<QueryResult<MightyCallRecording>> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/recordings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recording)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.recording], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Delete old reports (cleanup function)
 */
export async function deleteOldReports(orgId: string, olderThanDays: number): Promise<{ deleted_count: number; error: DatabaseError | null }> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/reports'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, older_than_days: olderThanDays })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { deleted_count: json.deleted_count || 0, error: null };
  } catch (err) {
    return {
      deleted_count: 0,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}