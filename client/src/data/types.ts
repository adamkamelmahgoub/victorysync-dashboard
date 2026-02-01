// Shared types for the data layer
export interface DatabaseError {
  message: string;
  code?: string;
}

export interface QueryResult<T> {
  data: T[] | null;
  error: DatabaseError | null;
  count?: number;
}

// Organization types
export interface Organization {
  id: string;
  name: string;
  timezone: string;
  sla_target_percent: number;
  sla_target_seconds: number;
  business_hours: Record<string, { open: string; close: string } | null>;
  escalation_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: 'agent' | 'org_manager' | 'org_admin' | 'org_owner' | 'owner' | 'admin' | 'member';
  mightycall_extension: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgManagerPermission {
  id: string;
  org_member_id: string;
  can_manage_agents: boolean;
  can_manage_phone_numbers: boolean;
  can_edit_service_targets: boolean;
  can_view_billing: boolean;
  created_at: string;
  updated_at: string;
}

// Phone numbers types
export interface PhoneNumber {
  id: string;
  number: string;
  external_id: string;
  org_id: string | null;
  label: string | null;
  created_at: string;
  updated_at: string;
}

// Packages and billing types
export interface Package {
  id: string;
  name: string;
  description: string | null;
  type: 'user' | 'org' | 'platform';
  features: Record<string, any>;
  pricing: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserPackage {
  id: string;
  user_id: string;
  package_id: string;
  assigned_by: string | null;
  assigned_at: string;
  expires_at: string | null;
  is_active: boolean;
  metadata: Record<string, any>;
  packages?: Package;
}

export interface BillingRecord {
  id: string;
  org_id: string | null;
  user_id: string | null;
  type: 'subscription' | 'one_time' | 'usage' | 'refund';
  description: string;
  amount: number;
  currency: string;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  billing_date: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  org_id: string;
  invoice_number: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  stripe_invoice_id: string | null;
  pdf_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  metadata: Record<string, any>;
}

// MightyCall integration types
export interface MightyCallReport {
  id: string;
  org_id: string;
  phone_number_id: string;
  report_type: string;
  report_date: string;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface MightyCallRecording {
  id: string;
  org_id: string;
  phone_number_id: string;
  call_id: string;
  recording_url: string | null;
  duration_seconds: number | null;
  recording_date: string;
  metadata: Record<string, any>;
  created_at: string;
  phone_numbers?: {
    number: string;
    label: string | null;
  };
}

export interface IntegrationSyncJob {
  id: string;
  org_id: string;
  integration_type: 'mightycall_numbers' | 'mightycall_reports' | 'mightycall_recordings';
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

// Support and audit types
export interface SupportTicket {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string | null;
  assigned_to: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  org_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Org settings
export interface OrgSettings {
  id: string;
  org_id: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}