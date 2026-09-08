-- TeleChat schema — run this in the Supabase SQL editor (or via `supabase db push`)

create extension if not exists "pgcrypto";

-- 1. Profiles ---------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  bio text,
  status text default 'offline',
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Profiles are readable by any authenticated user"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

-- auto-create a profile row when a new auth user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)) || '_' || substr(new.id::text, 1, 4),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Conversations ------------------------------------------------------------

create table conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group', 'channel')),
  name text,
  avatar_url text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table conversation_members (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

alter table conversations enable row level security;
alter table conversation_members enable row level security;

-- Membership checks go through SECURITY DEFINER functions rather than a
-- direct subquery on conversation_members. A policy on conversation_members
-- that subqueries conversation_members triggers its own RLS policy again,
-- which recurses infinitely ("infinite recursion detected in policy for
-- relation conversation_members") — these functions run with elevated
-- privilege internally, bypassing RLS for just that lookup, breaking the loop.

create function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = p_conversation_id and user_id = p_user_id
  );
$$;

create function public.is_conversation_admin(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = p_conversation_id and user_id = p_user_id and role in ('owner', 'admin')
  );
$$;

create policy "Members can see their conversations"
  on conversations for select
  to authenticated
  using (
    -- also true for the creator before their own membership row exists yet,
    -- needed for the INSERT ... RETURNING right after creating a conversation
    is_conversation_member(id, auth.uid()) or created_by = auth.uid()
  );

create policy "Authenticated users can create conversations"
  on conversations for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Members can see the membership of their conversations"
  on conversation_members for select
  to authenticated
  using (is_conversation_member(conversation_id, auth.uid()));

create policy "Users can add members to conversations they create or belong to"
  on conversation_members for insert
  to authenticated
  with check (
    user_id = auth.uid() or is_conversation_admin(conversation_id, auth.uid())
  );

-- 3. Messages -----------------------------------------------------------------

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  content text,
  media_url text,
  media_type text check (media_type in ('image', 'video', 'audio', 'file')),
  reply_to uuid references messages(id) on delete set null,
  edited_at timestamptz,
  flagged boolean default false,
  created_at timestamptz default now()
);

create index messages_conversation_id_created_at_idx
  on messages (conversation_id, created_at desc);

alter table messages enable row level security;

create policy "Members can read messages in their conversations"
  on messages for select
  to authenticated
  using (is_conversation_member(conversation_id, auth.uid()));

create policy "Members can send messages in their conversations"
  on messages for insert
  to authenticated
  with check (
    sender_id = auth.uid() and is_conversation_member(conversation_id, auth.uid())
  );

create policy "Senders can edit their own messages"
  on messages for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy "Senders can delete their own messages"
  on messages for delete
  to authenticated
  using (sender_id = auth.uid());

-- 3b. Reactions -----------------------------------------------------------------

create table message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, user_id)
);

alter table message_reactions enable row level security;

create policy "Members can view reactions in their conversations"
  on message_reactions for select
  to authenticated
  using (is_conversation_member(conversation_id, auth.uid()));

create policy "Members can react to messages in their conversations"
  on message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid() and is_conversation_member(conversation_id, auth.uid())
  );

create policy "Users can change their own reaction"
  on message_reactions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can remove their own reaction"
  on message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- 3c. Privacy: online status + blocking ------------------------------------------

alter table profiles add column if not exists show_online_status boolean default true;

create table blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (blocker_id, blocked_id)
);

alter table blocked_users enable row level security;

create policy "Users can view their own block list"
  on blocked_users for select
  to authenticated
  using (blocker_id = auth.uid());

create policy "Users can block others"
  on blocked_users for insert
  to authenticated
  with check (blocker_id = auth.uid() and blocked_id != auth.uid());

create policy "Users can unblock"
  on blocked_users for delete
  to authenticated
  using (blocker_id = auth.uid());

create function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from blocked_users
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- Two people who've blocked each other (in either direction) can no longer be
-- added to the same conversation, or exchange messages in one they already share.

drop policy "Users can add members to conversations they create or belong to" on conversation_members;
create policy "Users can add members to conversations they create or belong to"
  on conversation_members for insert
  to authenticated
  with check (
    not is_blocked(auth.uid(), user_id)
    and (user_id = auth.uid() or is_conversation_admin(conversation_id, auth.uid()))
  );

drop policy "Members can send messages in their conversations" on messages;
create policy "Members can send messages in their conversations"
  on messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and is_conversation_member(conversation_id, auth.uid())
    and not exists (
      select 1 from conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id != auth.uid()
        and is_blocked(auth.uid(), cm.user_id)
    )
  );

-- 3d. Read receipts ---------------------------------------------------------------

-- One row per (conversation, member): how far that member has read. A message
-- is "read" once every other member's last_read_at is at or after it —
-- WhatsApp-style single grey check (sent) vs double blue check (read).
create table message_reads (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table message_reads enable row level security;

create policy "Members can view read receipts in their conversations"
  on message_reads for select
  to authenticated
  using (is_conversation_member(conversation_id, auth.uid()));

create policy "Users can set their own read receipt"
  on message_reads for insert
  to authenticated
  with check (user_id = auth.uid() and is_conversation_member(conversation_id, auth.uid()));

create policy "Users can update their own read receipt"
  on message_reads for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4. Realtime -------------------------------------------------------------------

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversation_members;
alter publication supabase_realtime add table message_reactions;
alter publication supabase_realtime add table message_reads;

-- 5. Storage --------------------------------------------------------------------
-- Create a public "media" bucket from the Supabase dashboard (Storage > New bucket,
-- name: media, public: true), then apply these policies:

-- insert into storage.buckets (id, name, public) values ('media', 'media', true);

create policy "Authenticated users can upload media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'media');

create policy "Anyone can view media"
  on storage.objects for select
  using (bucket_id = 'media');
