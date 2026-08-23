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
    alter table clients add column if not exists status text not null default 'active';
    alter table clients add column if not exists shopify_customer_id text;
    alter table clients add column if not exists total_spent_cents bigint not null default 0;
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
    insert into milestones(product_id,name,status,sort_order)
      select p.id, m.name, case when m.n < 3 then 'complete' when m.n = 3 then 'current' else 'upcoming' end, m.n
      from products p cross join (values (1,'Brief'),(2,'Concept'),(3,'Development'),(4,'Sample'),(5,'Approval'),(6,'Production'),(7,'Quality'),(8,'Delivery')) m(n,name)
      where not exists(select 1 from milestones x where x.product_id=p.id);
  `);
}
