-- Create MightyCall-related tables for syncing data

-- Call History Table
CREATE TABLE IF NOT EXISTS public.call_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  from_number text,
  to_number text,
  direction text CHECK (direction IN ('inbound', 'outbound')),
  status text,
  duration_seconds integer DEFAULT 0,
  call_date timestamptz,
  recording_url text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_call_history_org_id ON public.call_history(org_id);
CREATE INDEX IF NOT EXISTS idx_call_history_call_date ON public.call_history(call_date DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_org_date ON public.call_history(org_id, call_date DESC);

-- Voicemail Logs Table
CREATE TABLE IF NOT EXISTS public.voicemail_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  from_number text,
  to_number text,
  duration_seconds integer,
  message_date timestamptz,
  status text DEFAULT 'new',
  transcription text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_voicemail_logs_org_id ON public.voicemail_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_logs_message_date ON public.voicemail_logs(message_date DESC);
CREATE INDEX IF NOT EXISTS idx_voicemail_logs_org_date ON public.voicemail_logs(org_id, message_date DESC);

-- SMS Logs Table
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_number text,
  to_numbers text[] DEFAULT ARRAY[]::text[],
  message_text text,
  direction text CHECK (direction IN ('inbound', 'outbound')),
  status text,
  sent_at timestamptz,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_org_id ON public.sms_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON public.sms_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_org_sent_at ON public.sms_logs(org_id, sent_at DESC);

-- MightyCall Extensions Table
CREATE TABLE IF NOT EXISTS public.mightycall_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extension text NOT NULL UNIQUE,
  external_id text,
  display_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mightycall_extensions_extension ON public.mightycall_extensions(extension);

-- MightyCall Reports Table
CREATE TABLE IF NOT EXISTS public.mightycall_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  report_type text,
  report_date date,
  data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mightycall_reports_org_id ON public.mightycall_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_mightycall_reports_report_date ON public.mightycall_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_mightycall_reports_phone_number_id ON public.mightycall_reports(phone_number_id);

-- Contact Events Table
CREATE TABLE IF NOT EXISTS public.contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text,
  phone_numbers text[],
  email text,
  event_type text,
  event_date timestamptz,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_events_org_id ON public.contact_events(org_id);
CREATE INDEX IF NOT EXISTS idx_contact_events_event_date ON public.contact_events(event_date DESC);

-- Call Recordings Table
CREATE TABLE IF NOT EXISTS public.mightycall_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  call_id text,
  recording_url text,
  duration_seconds integer,
  recording_date timestamptz,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mightycall_recordings_org_id ON public.mightycall_recordings(org_id);
CREATE INDEX IF NOT EXISTS idx_mightycall_recordings_recording_date ON public.mightycall_recordings(recording_date DESC);
CREATE INDEX IF NOT EXISTS idx_mightycall_recordings_phone_number_id ON public.mightycall_recordings(phone_number_id);

-- User Phone Assignments Table (for per-user access control)
CREATE TABLE IF NOT EXISTS public.user_phone_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id uuid NOT NULL REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  can_call boolean DEFAULT true,
  can_receive boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id, phone_number_id)
);

CREATE INDEX IF NOT EXISTS idx_user_phone_assignments_org_id ON public.user_phone_assignments(org_id);
CREATE INDEX IF NOT EXISTS idx_user_phone_assignments_user_id ON public.user_phone_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_phone_assignments_phone_number_id ON public.user_phone_assignments(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_user_phone_assignments_org_user ON public.user_phone_assignments(org_id, user_id);
