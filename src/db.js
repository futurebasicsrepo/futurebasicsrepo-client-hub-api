import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

export async function migrate() {
  await pool.query(`
    create extension if not exists pgcrypto;
    create table if not exists clients (
      id uuid primary key default gen_random_uuid(),
      slug text unique not null,
      name text not null,
      email_domains text[] not null default '{}',
      created_at timestamptz not null default now()
    );
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references clients(id),
      email text unique not null,
      name text,
      role text not null default 'client' check (role in ('client','admin')),
      created_at timestamptz not null default now()
    );
    create table if not exists login_codes (
      id uuid primary key default gen_random_uuid(),
      email text not null,
      code_hash text not null,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    );
    create table if not exists requests (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references clients(id),
      user_id uuid references users(id),
      type text not null,
      title text not null,
      details text not null,
      status text not null default 'submitted',
      due_date date,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists files (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references clients(id),
      request_id uuid references requests(id),
      uploader_id uuid references users(id),
      original_name text not null,
      storage_name text unique not null,
      mime_type text,
      size_bytes bigint not null,
      created_at timestamptz not null default now()
    );
    create table if not exists invoices (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references clients(id),
      number text not null,
      amount_cents integer not null,
      currency text not null default 'USD',
      status text not null check (status in ('draft','due','paid','void')),
      due_date date,
      external_url text,
      created_at timestamptz not null default now(),
      unique(client_id, number)
    );
    create table if not exists projects (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references clients(id),
      name text not null,
      status text not null default 'concept',
      milestone text,
      target_date date,
      updated_at timestamptz not null default now()
    );
    insert into clients(slug,name,email_domains)
      values ('ouster','Ouster',array['ouster.io','ouster.com'])
      on conflict (slug) do update set email_domains=excluded.email_domains;
  `);
}
