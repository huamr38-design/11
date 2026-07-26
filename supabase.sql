create table if not exists app_users (
  username text primary key,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists user_states (
  username text primary key references app_users(username) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_states_updated_at_idx on user_states(updated_at desc);
