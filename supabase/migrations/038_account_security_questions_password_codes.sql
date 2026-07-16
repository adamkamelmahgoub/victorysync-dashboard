  create table if not exists public.user_password_change_codes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    email text not null,
    code_hash text not null,
    expires_at timestamptz not null,
    consumed_at timestamptz null,
    created_at timestamptz not null default now()
  );

  create index if not exists user_password_change_codes_lookup_idx
    on public.user_password_change_codes (user_id, expires_at desc, consumed_at);

  alter table public.user_password_change_codes enable row level security;

  create table if not exists public.user_security_questions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    question_order int not null,
    question text not null,
    answer_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_security_questions_user_order_unique unique (user_id, question_order)
  );

  create index if not exists user_security_questions_user_idx
    on public.user_security_questions (user_id, question_order);

  alter table public.user_security_questions enable row level security;
