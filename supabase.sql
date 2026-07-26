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

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('maintenance', '{"enabled":false,"message":"网站维护中，请稍后再来。"}'::jsonb)
on conflict (key) do nothing;
