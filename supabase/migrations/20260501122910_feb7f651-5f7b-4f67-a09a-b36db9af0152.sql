
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Users view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  logline text,
  genre text,
  visual_style text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;
create policy "Owner select projects" on public.projects for select using (auth.uid() = user_id);
create policy "Owner insert projects" on public.projects for insert with check (auth.uid() = user_id);
create policy "Owner update projects" on public.projects for update using (auth.uid() = user_id);
create policy "Owner delete projects" on public.projects for delete using (auth.uid() = user_id);

-- Characters
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  reference_image text,
  created_at timestamptz not null default now()
);
alter table public.characters enable row level security;
create policy "Owner select characters" on public.characters for select using (auth.uid() = user_id);
create policy "Owner insert characters" on public.characters for insert with check (auth.uid() = user_id);
create policy "Owner update characters" on public.characters for update using (auth.uid() = user_id);
create policy "Owner delete characters" on public.characters for delete using (auth.uid() = user_id);

-- Scenes
create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scene_number int not null default 1,
  title text,
  prompt text,
  narration text,
  image_url text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.scenes enable row level security;
create policy "Owner select scenes" on public.scenes for select using (auth.uid() = user_id);
create policy "Owner insert scenes" on public.scenes for insert with check (auth.uid() = user_id);
create policy "Owner update scenes" on public.scenes for update using (auth.uid() = user_id);
create policy "Owner delete scenes" on public.scenes for delete using (auth.uid() = user_id);

create index on public.projects(user_id);
create index on public.characters(project_id);
create index on public.scenes(project_id, scene_number);
