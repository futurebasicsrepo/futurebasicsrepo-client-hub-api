import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  // Safety net: a lock wait fails after 15s instead of hanging a request forever, and a transaction left idle (a request
  // that died mid-way) is killed after 60s so its locks and connection come back. Legitimate waits here are sub-second.
  options: '-c lock_timeout=15000 -c idle_in_transaction_session_timeout=60000',
  max: Number(process.env.PG_POOL_MAX) || 20
});
// A connection the database drops (idle-in-transaction timeout, a restart, a network blip) emits 'error' on its client. With nobody
// listening, Node treats that as fatal and the whole service goes down. Log it, mark the client dead, and make sure a dead client is
// destroyed on release instead of being handed to the next request.
pool.on('connect', client => client.on('error', e => { client.__dead = true; console.error('postgres client error:', e.message); }));
pool.on('error', e => console.error('postgres pool error:', e.message));
const connectOnce = pool.connect.bind(pool);
pool.connect = async (...args) => {
  if (args.length) return connectOnce(...args);
  const client = await connectOnce(), release = client.release.bind(client);
  client.release = err => release(err ?? (client.__dead ? true : undefined));
  return client;
};

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
    alter table clients add column if not exists status text not null default 'active';
    alter table clients add column if not exists shopify_customer_id text;
    alter table clients add column if not exists total_spent_cents bigint not null default 0;
    alter table clients add column if not exists contact_name text;
    alter table clients add column if not exists contact_email text;
    alter table clients add column if not exists contact_phone text;
    alter table clients add column if not exists website_url text;
    alter table clients add column if not exists notes text;
    alter table clients add column if not exists shopify_order_count integer not null default 0;
    alter table clients add column if not exists shopify_currency text not null default 'USD';
    alter table clients add column if not exists shopify_default_address jsonb;
    alter table clients add column if not exists shopify_synced_at timestamptz;
    alter table clients add column if not exists archived_at timestamptz;
    alter table clients add column if not exists archive_previous_status text;
    alter table clients add column if not exists allowed_emails text[] not null default '{}';
    alter table clients add column if not exists activated_at timestamptz;
    alter table clients add column if not exists welcome_sent_at timestamptz;
    alter table clients add column if not exists tech_pack_comped boolean not null default false;
    alter table clients add column if not exists membership_active_until timestamptz;
    alter table clients add column if not exists membership_checked_at timestamptz;
    alter table clients add column if not exists acquisition jsonb;
    alter table clients add column if not exists marketing_opt_out_at timestamptz;
    update clients set archived_at=coalesce(archived_at,now()),archive_previous_status=coalesce(archive_previous_status,'active'),status='archived'
      where status in ('archive','archived');
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references clients(id),
      email text unique not null,
      name text,
      role text not null default 'client' check (role in ('client','admin')),
      created_at timestamptz not null default now()
    );
    do $$ begin
      if not exists(select 1 from information_schema.columns where table_name='users' and column_name='email_verified_at') then
        alter table users add column email_verified_at timestamptz;
        update users set email_verified_at=created_at; -- everyone who exists today has signed in some way already
      end if;
    end $$;
    create table if not exists login_codes (
      id uuid primary key default gen_random_uuid(),
      email text not null,
      code_hash text not null,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    );
    create table if not exists preview_sessions (
      id uuid primary key default gen_random_uuid(),
      code_hash text unique not null,
      admin_user_id uuid not null references users(id) on delete cascade,
      client_id uuid not null references clients(id) on delete cascade,
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
    alter table projects add column if not exists archived_at timestamptz;
    alter table projects add column if not exists archive_previous_status text;
    update projects set archived_at=coalesce(archived_at,now()),archive_previous_status=coalesce(archive_previous_status,'active'),status='archived'
      where status in ('archive','archived');
    create unique index if not exists projects_client_name_idx on projects(client_id,name);
    create index if not exists clients_archived_at_idx on clients(archived_at);
    create index if not exists projects_client_archived_idx on projects(client_id,archived_at,updated_at desc);
    alter table requests add column if not exists project_id uuid references projects(id) on delete set null;
    alter table requests add column if not exists intake_data jsonb not null default '{}';
    create index if not exists requests_project_idx on requests(project_id,created_at desc);
    create table if not exists products (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references clients(id),
      shopify_handle text,
      title text not null,
      status text not null default 'brief',
      current_stage text not null default 'brief',
      owner text,
      target_date date,
      target_quantity integer,
      target_budget_cents integer,
      latest_visual_url text,
      risk_level text not null default 'on-track',
      updated_at timestamptz not null default now(),
      unique(client_id, shopify_handle)
    );
    alter table products add column if not exists shopify_product_id text;
    alter table products add column if not exists shopify_variant_id text;
    alter table products add column if not exists shopify_status text;
    alter table products add column if not exists shopify_inventory_total integer;
    alter table products add column if not exists shopify_variants jsonb not null default '[]';
    alter table products add column if not exists shopify_synced_at timestamptz;
    alter table products add column if not exists source_of_truth text not null default 'shopify';
    alter table products add column if not exists rush_mode boolean not null default false;
    alter table products add column if not exists rush_reason text;
    alter table products add column if not exists rush_activated_at timestamptz;
    alter table products add column if not exists rush_activated_by uuid references users(id);
    alter table products add column if not exists description_html text;
    alter table products add column if not exists vendor text;
    alter table products add column if not exists product_type text;
    alter table products add column if not exists template_suffix text;
    alter table products add column if not exists shopify_published_at timestamptz;
    alter table products add column if not exists shopify_publish_error text;
    alter table products add column if not exists shopify_image_url text;
    alter table products add column if not exists shopify_image_alt text;
    alter table products add column if not exists shopify_updated_at timestamptz;
    alter table products add column if not exists project_id uuid references projects(id) on delete set null;
    alter table products add column if not exists waiting_on text;
    alter table requests add column if not exists product_id uuid references products(id);
    create table if not exists product_briefs (
      product_id uuid primary key references products(id) on delete cascade,
      objective text,
      audience text,
      target_quantity integer,
      target_budget_cents integer,
      delivery_date date,
      decoration text,
      packaging text,
      fulfillment text,
      notes text,
      status text not null default 'draft',
      updated_at timestamptz not null default now()
    );
    create table if not exists milestones (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references products(id) on delete cascade,
      name text not null,
      status text not null default 'upcoming',
      due_date date,
      completed_at timestamptz,
      sort_order integer not null default 0
    );
    alter table milestones add column if not exists required boolean not null default true;
    alter table milestones add column if not exists client_visible boolean not null default true;
    alter table milestones add column if not exists responsible_party text not null default 'future-basics';
    alter table milestones add column if not exists notes text;
    create table if not exists quotes (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references products(id) on delete cascade,
      version integer not null default 1,
      currency text not null default 'USD',
      quantity integer not null,
      unit_cost_cents integer not null,
      tooling_cents integer not null default 0,
      freight_cents integer not null default 0,
      status text not null default 'draft',
      expires_at date,
      created_at timestamptz not null default now(),
      unique(product_id, version)
    );
    alter table quotes add column if not exists wholesale_cents integer;
    alter table quotes add column if not exists srp_cents integer;
    alter table quotes add column if not exists notes text;
    alter table quotes add column if not exists shopify_draft_order_id text;
    alter table quotes add column if not exists shopify_draft_order_name text;
    alter table quotes add column if not exists shopify_draft_order_status text;
    alter table quotes add column if not exists shopify_invoice_url text;
    alter table quotes add column if not exists shopify_invoice_sent_at timestamptz;
    alter table quotes add column if not exists shopify_order_id text;
    alter table quotes add column if not exists shopify_financial_status text;
    alter table quotes add column if not exists shopify_fulfillment_status text;
    alter table quotes add column if not exists shopify_synced_at timestamptz;
    alter table quotes add column if not exists decided_by uuid references users(id);
    alter table quotes add column if not exists decided_at timestamptz;
    alter table quotes add column if not exists decision_notes text;
    create table if not exists approvals (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references products(id) on delete cascade,
      requested_by uuid references users(id),
      decided_by uuid references users(id),
      kind text not null,
      version text not null,
      title text not null,
      status text not null default 'pending',
      notes text,
      requested_at timestamptz not null default now(),
      decided_at timestamptz
    );
    create table if not exists activities (
      id bigserial primary key,
      client_id uuid not null references clients(id),
      product_id uuid references products(id) on delete cascade,
      actor_id uuid references users(id),
      type text not null,
      summary text not null,
      metadata jsonb not null default '{}',
      created_at timestamptz not null default now()
    );
    create table if not exists suppliers (
      id uuid primary key default gen_random_uuid(),
      name text unique not null,
      contact_email text,
      contact_phone text,
      country text,
      lead_time_days integer,
      status text not null default 'active',
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists product_configurations (
      id uuid primary key default gen_random_uuid(),
      product_id uuid unique not null references products(id) on delete cascade,
      supplier_id uuid references suppliers(id),
      blank_name text,
      material text,
      construction text,
      decoration_method text,
      decoration_locations text[] not null default '{}',
      artwork_width_in numeric(8,2),
      artwork_height_in numeric(8,2),
      colorways text[] not null default '{}',
      sizes text[] not null default '{}',
      variant_plan jsonb not null default '[]',
      packaging text,
      fulfillment text,
      moq integer,
      sample_required boolean not null default true,
      lead_time_days integer,
      notes text,
      status text not null default 'draft',
      updated_at timestamptz not null default now()
    );
    create table if not exists price_tiers (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references products(id) on delete cascade,
      min_quantity integer not null,
      max_quantity integer,
      unit_cost_cents integer not null,
      wholesale_cents integer not null,
      srp_cents integer,
      setup_cents integer not null default 0,
      freight_cents integer not null default 0,
      lead_time_days integer,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(product_id,min_quantity)
    );
    alter table quotes add column if not exists price_tier_id uuid references price_tiers(id);
    alter table quotes add column if not exists configuration_snapshot jsonb;
    create table if not exists production_runs (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references products(id) on delete cascade,
      supplier_id uuid references suppliers(id),
      po_number text unique,
      quantity integer not null,
      unit_cost_cents integer,
      currency text not null default 'USD',
      status text not null default 'planned',
      sample_status text not null default 'not-started',
      ex_factory_date date,
      eta_date date,
      notes text,
      internal_notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists qc_inspections (
      id uuid primary key default gen_random_uuid(),
      production_run_id uuid not null references production_runs(id) on delete cascade,
      inspector text,
      status text not null default 'pending',
      inspected_units integer,
      defect_units integer,
      checklist jsonb not null default '{}',
      notes text,
      created_at timestamptz not null default now()
    );
    create table if not exists shipments (
      id uuid primary key default gen_random_uuid(),
      production_run_id uuid not null references production_runs(id) on delete cascade,
      carrier text,
      tracking_number text,
      tracking_url text,
      status text not null default 'preparing',
      destination text,
      shipped_at timestamptz,
      eta_date date,
      delivered_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists assets (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references products(id) on delete cascade,
      name text not null,
      kind text not null default 'artwork',
      status text not null default 'working',
      visibility text not null default 'client',
      current_version integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(product_id,name)
    );
    create table if not exists asset_versions (
      id uuid primary key default gen_random_uuid(),
      asset_id uuid not null references assets(id) on delete cascade,
      uploader_id uuid references users(id),
      version integer not null,
      original_name text not null,
      storage_name text unique not null,
      mime_type text,
      size_bytes bigint not null,
      notes text,
      created_at timestamptz not null default now(),
      unique(asset_id,version)
    );
    alter table assets add column if not exists approved_version_id uuid references asset_versions(id);
    alter table approvals add column if not exists asset_version_id uuid references asset_versions(id);
    create table if not exists comments (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references clients(id) on delete cascade,
      product_id uuid not null references products(id) on delete cascade,
      asset_id uuid references assets(id) on delete cascade,
      approval_id uuid references approvals(id) on delete cascade,
      author_id uuid references users(id),
      author_role text not null,
      body text not null,
      visibility text not null default 'client',
      created_at timestamptz not null default now()
    );
    create table if not exists project_messages (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references projects(id) on delete cascade,
      client_id uuid not null references clients(id) on delete cascade,
      author_id uuid references users(id) on delete set null,
      author_role text not null check (author_role in ('admin','client')),
      body text not null,
      created_at timestamptz not null default now()
    );
    alter table project_messages add column if not exists reply_to_id uuid references project_messages(id) on delete set null;
    create index if not exists project_messages_thread_idx on project_messages(project_id,created_at);
    create table if not exists project_files (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references projects(id) on delete cascade,
      client_id uuid not null references clients(id) on delete cascade,
      message_id uuid references project_messages(id) on delete set null,
      uploader_id uuid references users(id) on delete set null,
      uploader_role text not null check (uploader_role in ('admin','client')),
      original_name text not null,
      storage_name text unique not null,
      mime_type text,
      size_bytes bigint not null,
      created_at timestamptz not null default now()
    );
    create index if not exists project_files_project_idx on project_files(project_id,created_at desc);
    alter table invoices add column if not exists project_id uuid references projects(id) on delete set null;
    alter table invoices add column if not exists product_id uuid references products(id) on delete set null;
    alter table invoices add column if not exists quote_id uuid references quotes(id) on delete set null;
    alter table invoices add column if not exists shopify_draft_order_id text;
    alter table invoices add column if not exists shopify_draft_order_status text;
    alter table invoices add column if not exists shopify_invoice_sent_at timestamptz;
    alter table invoices add column if not exists shopify_order_id text;
    alter table invoices add column if not exists shopify_financial_status text;
    alter table invoices add column if not exists product_ids uuid[] not null default '{}';
    -- deposit: the sample deposit invoiced when a quote is accepted; balance: the rest, invoiced when production starts
    alter table invoices add column if not exists kind text not null default 'invoice';
    alter table quotes add column if not exists deposit_pct integer;
    create index if not exists invoices_project_idx on invoices(project_id,created_at desc);
    create index if not exists invoices_draft_order_idx on invoices(shopify_draft_order_id);
    update invoices i set project_id=p.project_id,product_id=p.id,quote_id=q.id
      from quotes q join products p on p.id=q.product_id
      where i.client_id=p.client_id and i.number=q.shopify_draft_order_name
        and (i.project_id is null or i.product_id is null or i.quote_id is null);
    create table if not exists tech_packs (
      id uuid primary key default gen_random_uuid(),
      product_id uuid unique not null references products(id) on delete cascade,
      client_id uuid not null references clients(id) on delete cascade,
      version integer not null default 0,
      status text not null default 'draft',
      data jsonb not null default '{}',
      published_data jsonb,
      published_at timestamptz,
      published_by uuid references users(id),
      revisions jsonb not null default '[]',
      created_by uuid references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    alter table tech_packs add column if not exists verification jsonb not null default '{}';
    alter table tech_packs add column if not exists locked_at timestamptz;
    alter table tech_packs add column if not exists initiated_by text not null default 'brand';
    alter table tech_packs add column if not exists submitted_at timestamptz;
    alter table tech_packs add column if not exists submitted_by uuid references users(id);
    alter table tech_packs add column if not exists source text not null default 'hub';
    alter table tech_packs add column if not exists followup_sent_at timestamptz;
    alter table tech_packs add column if not exists followup_stale_notified_at timestamptz;
    alter table tech_packs add column if not exists ai_status text;
    alter table tech_packs add column if not exists ai_error text;
    alter table tech_packs add column if not exists ai_model text;
    alter table tech_packs add column if not exists ai_completed_at timestamptz;
    alter table tech_packs add column if not exists ai_reviewed_at timestamptz;
    alter table tech_packs add column if not exists ai_reviewed_by uuid references users(id) on delete set null;
    alter table tech_packs add column if not exists translations jsonb not null default '{}';
    alter table tech_packs add column if not exists ai_attempts int not null default 0;
    alter table tech_packs add column if not exists ai_started_at timestamptz;
    alter table tech_packs add column if not exists ai_auto_retries int not null default 0;
    alter table tech_packs add column if not exists billing text;
    alter table tech_packs add column if not exists pay_draft_order_id text;
    alter table tech_packs add column if not exists pay_invoice_url text;
    alter table tech_packs add column if not exists pay_order_id text;
    alter table tech_packs add column if not exists paid_at timestamptz;
    alter table tech_packs add column if not exists ai_draft jsonb;
    alter table tech_packs add column if not exists ai_draft_at timestamptz;
    create table if not exists tech_pack_edit_stats (
      id uuid primary key default gen_random_uuid(),
      tech_pack_id uuid not null references tech_packs(id) on delete cascade,
      product_id uuid references products(id) on delete cascade,
      client_id uuid references clients(id) on delete cascade,
      stage text not null,
      version int not null default 0,
      stats jsonb not null default '{}',
      created_at timestamptz not null default now(),
      unique(tech_pack_id,stage,version)
    );
    alter table tech_packs add column if not exists pay_variant_id text;
    -- Every payment a client has made through the store, one row per order. Tech packs, memberships and anything else the store sold them.
    create table if not exists payments (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references clients(id) on delete cascade,
      product_id uuid references products(id) on delete set null,
      tech_pack_id uuid references tech_packs(id) on delete set null,
      kind text not null default 'order',
      title text,
      amount_cents bigint not null,
      currency text not null default 'USD',
      shopify_order_id text,
      shopify_order_name text,
      paid_at timestamptz not null default now(),
      source text not null default 'sync',
      created_at timestamptz not null default now()
    );
    create unique index if not exists payments_order_idx on payments(shopify_order_id) where shopify_order_id is not null;
    create index if not exists payments_client_idx on payments(client_id, paid_at desc);
    create table if not exists platform_events (
      id bigserial primary key,
      at timestamptz not null default now(),
      source text not null,
      level text not null default 'error',
      message text not null,
      detail jsonb not null default '{}'
    );
    create index if not exists platform_events_at_idx on platform_events(at desc);
    create table if not exists tech_pack_checks (
      id uuid primary key default gen_random_uuid(),
      tech_pack_id uuid not null references tech_packs(id) on delete cascade,
      product_id uuid not null references products(id) on delete cascade,
      client_id uuid not null references clients(id) on delete cascade,
      pack_version int not null default 0,
      pack_updated_at timestamptz,
      trigger text not null default 'manual',
      status text not null default 'pending',
      attempts int not null default 0,
      render_status text,
      provider text,
      image_model text,
      check_model text,
      brief jsonb,
      verdict jsonb,
      score int,
      verdict_label text,
      renders jsonb not null default '[]',
      render_error text,
      error text,
      requested_by uuid,
      created_at timestamptz not null default now(),
      started_at timestamptz,
      completed_at timestamptz
    );
    alter table tech_pack_checks add column if not exists loop_id uuid;
    create table if not exists tech_pack_loops (
      id uuid primary key default gen_random_uuid(),
      tech_pack_id uuid not null references tech_packs(id) on delete cascade,
      product_id uuid not null references products(id) on delete cascade,
      client_id uuid not null references clients(id) on delete cascade,
      trigger text not null default 'build',
      status text not null default 'running',
      stage text not null default 'draft',
      events jsonb not null default '[]',
      changes jsonb not null default '[]',
      start_score int,
      final_score int,
      rounds int not null default 0,
      error text,
      requested_by uuid,
      created_at timestamptz not null default now(),
      finished_at timestamptz
    );
    create index if not exists tech_pack_loops_pack_idx on tech_pack_loops(tech_pack_id, created_at desc);
    create table if not exists tech_pack_models (
      id uuid primary key default gen_random_uuid(),
      tech_pack_id uuid not null references tech_packs(id) on delete cascade,
      product_id uuid not null references products(id) on delete cascade,
      client_id uuid not null references clients(id) on delete cascade,
      provider text not null,
      model text,
      task_id text,
      status text not null default 'running',
      progress int not null default 0,
      pack_version int not null default 0,
      stl_file text,
      thumb_file text,
      stl_bytes bigint,
      triangles int,
      size jsonb,
      credits int,
      error text,
      requested_by uuid,
      created_at timestamptz not null default now(),
      completed_at timestamptz
    );
    create table if not exists tech_pack_heroes (
      id uuid primary key default gen_random_uuid(),
      tech_pack_id uuid not null references tech_packs(id) on delete cascade,
      product_id uuid not null references products(id) on delete cascade,
      client_id uuid not null references clients(id) on delete cascade,
      status text not null default 'generating',
      provider text,
      model text,
      source_hash text,
      measured jsonb not null default '[]',
      candidates jsonb not null default '[]',
      chosen int not null default 0,
      trigger text not null default 'manual',
      error text,
      requested_by uuid,
      approved_by uuid,
      approved_at timestamptz,
      created_at timestamptz not null default now(),
      completed_at timestamptz
    );
    create index if not exists tech_pack_heroes_pack_idx on tech_pack_heroes(tech_pack_id, created_at desc);
    create table if not exists tech_pack_colourways (
      id uuid primary key default gen_random_uuid(),
      tech_pack_id uuid not null references tech_packs(id) on delete cascade,
      product_id uuid not null references products(id) on delete cascade,
      client_id uuid not null references clients(id) on delete cascade,
      status text not null default 'running',
      trigger text,
      requested_by uuid,
      progress jsonb not null default '{}'::jsonb,
      made int not null default 0,
      skipped jsonb not null default '[]'::jsonb,
      reference text,
      error text,
      created_at timestamptz not null default now(),
      completed_at timestamptz
    );
    create index if not exists tech_pack_colourways_pack_idx on tech_pack_colourways(tech_pack_id, created_at desc);
    alter table tech_pack_heroes add column if not exists shared_at timestamptz;
    alter table tech_pack_heroes add column if not exists auto_approved boolean not null default false;
    alter table tech_pack_checks add column if not exists hero_id uuid;
    create index if not exists tech_pack_models_product_idx on tech_pack_models(product_id, created_at desc);
    alter table tech_pack_models add column if not exists source text not null default 'photo';
    alter table tech_pack_models add column if not exists source_check_id uuid;
    alter table tech_pack_models add column if not exists source_score int;
    alter table tech_pack_models add column if not exists forced boolean not null default false;
    alter table tech_pack_loops add column if not exists final_check_id uuid;
    alter table tech_pack_loops add column if not exists outcome text;
    create index if not exists tech_pack_checks_product_idx on tech_pack_checks(product_id, created_at desc);
    -- one check per submission of a given state of the pack: resubmitting after edits checks again, submitting twice unchanged does not
    drop index if exists tech_pack_checks_submit_once;
    create unique index if not exists tech_pack_checks_submit_state on tech_pack_checks(tech_pack_id, pack_version, pack_updated_at) where trigger='submit';
    create table if not exists app_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
    create table if not exists signin_attempts (
      email text primary key,
      client_id uuid references clients(id) on delete cascade,
      kind text not null default 'unknown',
      attempts int not null default 1,
      first_at timestamptz not null default now(),
      last_at timestamptz not null default now(),
      alerted_at timestamptz
    );
    create table if not exists nurture_sends (
      client_id uuid not null references clients(id) on delete cascade,
      step text not null,
      status text not null default 'sent',
      sent_at timestamptz not null default now(),
      primary key(client_id, step)
    );
    create table if not exists tech_pack_shares (
      id uuid primary key default gen_random_uuid(),
      tech_pack_id uuid not null references tech_packs(id) on delete cascade,
      token_hash text unique not null,
      label text not null,
      email text,
      created_by uuid references users(id),
      expires_at timestamptz,
      revoked_at timestamptz,
      last_viewed_at timestamptz,
      view_count integer not null default 0,
      created_at timestamptz not null default now()
    );
    create index if not exists tech_pack_shares_pack_idx on tech_pack_shares(tech_pack_id,created_at desc);
    alter table tech_pack_shares add column if not exists kind text not null default 'review';
    alter table tech_pack_shares add column if not exists include_model boolean not null default false;
    alter table tech_pack_shares add column if not exists supplier_id uuid references suppliers(id) on delete set null;
    alter table tech_pack_shares add column if not exists assigned boolean not null default false;
    alter table tech_pack_shares add column if not exists waived_at timestamptz;
    alter table tech_pack_shares add column if not exists referral boolean not null default false;
    create unique index if not exists tech_pack_shares_referral_idx on tech_pack_shares(tech_pack_id,supplier_id) where referral;
    alter table suppliers add column if not exists page_epoch integer not null default 0;
    alter table suppliers add column if not exists page_hash text;
    create unique index if not exists suppliers_page_hash_idx on suppliers(page_hash) where page_hash is not null;
    create table if not exists factory_quotes (
      id uuid primary key default gen_random_uuid(),
      share_id uuid unique not null references tech_pack_shares(id) on delete cascade,
      tech_pack_id uuid not null references tech_packs(id) on delete cascade,
      version integer not null,
      company text, contact_name text, email text, wechat text, phone text,
      currency text not null default 'USD',
      tiers jsonb not null default '[]',
      moq integer, sample_cost numeric(14,2), sample_days integer, lead_days integer, tooling numeric(14,2),
      incoterm text, payment_terms text, valid_until date, notes text,
      history jsonb not null default '[]',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists factory_quotes_pack_idx on factory_quotes(tech_pack_id, updated_at desc);
    alter table factory_quotes add column if not exists entered_by uuid references users(id) on delete set null;
    -- Every published version, kept with its signatures: publishing v2 no longer erases what was signed on v1. Factory links serve the
    -- latest version the client approved; quotes and production runs record the version they were based on.
    -- Factories that signed up at a trade fair (or anywhere): each gets a referral code. Buyers who start a tech pack through
    -- the factory's link (/start?ref=f-CODE) carry the factory on their room's acquisition, so the console can show who sent them.
    create table if not exists partners (
      id uuid primary key default gen_random_uuid(),
      code text unique not null,
      kind text not null default 'factory',
      company text not null,
      contact_name text,
      email text,
      wechat text,
      phone text,
      city text,
      makes text,
      source text,
      lang text,
      notes text,
      created_at timestamptz not null default now()
    );
    alter table partners add column if not exists job_title text;
    alter table partners add column if not exists website text;
    alter table partners add column if not exists moq_note text;
    alter table partners add column if not exists rating integer;
    alter table partners add column if not exists supplier_id uuid references suppliers(id) on delete set null;
    alter table partners add column if not exists created_by uuid references users(id) on delete set null;
    alter table partners add column if not exists updated_at timestamptz not null default now();
    create table if not exists tech_pack_versions (
      id uuid primary key default gen_random_uuid(),
      tech_pack_id uuid not null references tech_packs(id) on delete cascade,
      version integer not null,
      data jsonb not null,
      verification jsonb not null default '{}',
      note text,
      published_at timestamptz not null default now(),
      published_by uuid references users(id),
      locked_at timestamptz,
      unique(tech_pack_id, version)
    );
    insert into tech_pack_versions(tech_pack_id,version,data,verification,published_at,published_by,locked_at)
      select id,version,published_data,verification,published_at,published_by,locked_at from tech_packs where published_at is not null and published_data is not null
      on conflict(tech_pack_id,version) do nothing;
    alter table quotes add column if not exists tech_pack_version integer;
    alter table production_runs add column if not exists tech_pack_version integer;
    create table if not exists notifications (
      id bigserial primary key,
      client_id uuid not null references clients(id) on delete cascade,
      user_id uuid references users(id) on delete cascade,
      type text not null,
      title text not null,
      entity_type text,
      entity_id text,
      read_at timestamptz,
      created_at timestamptz not null default now()
    );
    create table if not exists consignments (
      id uuid primary key default gen_random_uuid(),
      token text unique not null,
      seller_name text not null,
      seller_email text not null,
      seller_phone text,
      item_title text not null,
      brand text,
      size text,
      condition text not null,
      deal_type text not null default 'either',
      asking_cents integer,
      details text,
      status text not null default 'submitted',
      agreed_cents integer,
      staff_notes text,
      source text not null default 'storefront',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists consignments_status_idx on consignments(status,created_at desc);
    create index if not exists consignments_email_idx on consignments(seller_email);
    create table if not exists consignment_images (
      id uuid primary key default gen_random_uuid(),
      consignment_id uuid not null references consignments(id) on delete cascade,
      original_name text not null,
      storage_name text unique not null,
      mime_type text,
      size_bytes bigint not null,
      created_at timestamptz not null default now()
    );
    create table if not exists consignment_offers (
      id uuid primary key default gen_random_uuid(),
      consignment_id uuid not null references consignments(id) on delete cascade,
      by text not null check (by in ('store','seller')),
      kind text not null check (kind in ('offer','counter','accept','decline')),
      amount_cents integer,
      note text,
      status text not null default 'open' check (status in ('open','superseded','accepted','declined')),
      created_at timestamptz not null default now()
    );
    create index if not exists consignment_offers_idx on consignment_offers(consignment_id,created_at);
    create table if not exists product_offers (
      id uuid primary key default gen_random_uuid(),
      token text unique not null,
      shopify_product_id text not null,
      shopify_variant_id text not null,
      product_title text not null,
      variant_title text,
      image_url text,
      buyer_name text not null,
      buyer_email text not null,
      buyer_phone text,
      quantity integer not null default 1,
      list_price_cents integer not null,
      current_amount_cents integer not null,
      agreed_cents integer,
      status text not null default 'awaiting_payment' check (status in ('awaiting_payment','pending_review','countered','accepted','declined','expired','cancelled')),
      awaiting_counter_payment boolean not null default false,
      respond_by timestamptz,
      payment_due_by timestamptz,
      shopify_draft_order_id text,
      shopify_draft_order_invoice_url text,
      shopify_order_id text,
      shopify_order_name text,
      staff_notes text,
      source text not null default 'storefront',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists product_offers_status_idx on product_offers(status,created_at desc);
    create index if not exists product_offers_email_idx on product_offers(buyer_email);
    create table if not exists product_offer_moves (
      id uuid primary key default gen_random_uuid(),
      offer_id uuid not null references product_offers(id) on delete cascade,
      by text not null check (by in ('buyer','store','system')),
      kind text not null check (kind in ('offer','paid','counter','accept','decline','expire','cancel')),
      amount_cents integer,
      note text,
      created_at timestamptz not null default now()
    );
    create index if not exists product_offer_moves_idx on product_offer_moves(offer_id,created_at);
    insert into clients(slug,name,email_domains)
      values ('ouster','Ouster',array['ouster.io','ouster.com'])
      on conflict (slug) do nothing;
    insert into clients(slug,name,email_domains,shopify_customer_id,total_spent_cents) values
      ('future-basics','Future Basics',array['thefuturebasics.com'],null,0),
      ('tools-for-humanity','Tools for Humanity',array['toolsforhumanity.com'],'gid://shopify/Customer/9213023420613',3587500),
      ('britax','Britax Child Safety',array['britax.com'],'gid://shopify/Customer/9131845976261',100),
      ('famehouse-umg','Famehouse / UMG',array['umusic.com'],'gid://shopify/Customer/8841857761477',100)
      on conflict(slug) do update set name=excluded.name,
        shopify_customer_id=excluded.shopify_customer_id,total_spent_cents=excluded.total_spent_cents;
    insert into products(client_id,shopify_handle,title,status,current_stage,owner,risk_level)
      select c.id, v.handle, v.title, 'in-development', v.stage, 'Future Basics', v.risk
      from clients c cross join (values
        ('ouster-wide-mouth-bottle','Ouster Wide-Mouth Bottle','development','on-track'),
        ('omt-01-work-jacket','OMT-01 Work Jacket','sampling','attention'),
        ('sensor-lineup-tee-black','Sensor Lineup Tee - Black','approval','on-track'),
        ('sensor-lineup-tee-natural','Sensor Lineup Tee - Natural','development','on-track'),
        ('ouster-desk-mat','Ouster Desk Mat','quoting','on-track'),
        ('point-cloud-print-framed','Point Cloud Print - Framed','brief','on-track'),
        ('ouster-cap-natural','Ouster Cap - Natural','sampling','on-track'),
        ('ouster-cap-olive','Ouster Cap - Olive','sampling','on-track'),
        ('ouster-cap-black','Ouster Cap - Black','approval','attention')
      ) as v(handle,title,stage,risk)
      where c.slug='ouster' on conflict(client_id,shopify_handle) do nothing;
    update products p set shopify_product_id=v.shopify_id
      from (values
        ('ouster-wide-mouth-bottle','gid://shopify/Product/8982881468613'),
        ('omt-01-work-jacket','gid://shopify/Product/8982881501381'),
        ('sensor-lineup-tee-black','gid://shopify/Product/8982881534149'),
        ('sensor-lineup-tee-natural','gid://shopify/Product/8982881599685'),
        ('ouster-desk-mat','gid://shopify/Product/8982881632453'),
        ('point-cloud-print-framed','gid://shopify/Product/8982881665221'),
        ('ouster-cap-natural','gid://shopify/Product/8982881697989'),
        ('ouster-cap-olive','gid://shopify/Product/8982881730757'),
        ('ouster-cap-black','gid://shopify/Product/8982881763525')
      ) v(handle,shopify_id) where p.shopify_handle=v.handle;
    insert into projects(client_id,name,status,milestone)
      select c.id,'General development','active','In progress' from clients c
      where c.slug<>'future-basics' on conflict(client_id,name) do nothing;
    update products p set project_id=pr.id from projects pr
      where p.project_id is null and pr.client_id=p.client_id and pr.name='General development';
    insert into milestones(product_id,name,status,sort_order)
      select p.id, m.name, case when m.n < 3 then 'complete' when m.n = 3 then 'current' else 'upcoming' end, m.n
      from products p cross join (values (1,'Brief'),(2,'Concept'),(3,'Development'),(4,'Sample'),(5,'Approval'),(6,'Production'),(7,'Quality'),(8,'Delivery')) m(n,name)
      where not exists(select 1 from milestones x where x.product_id=p.id);
  `);
}
