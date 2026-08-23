# Future Basics Client Hub API

Backend for the Future Basics Shopify client hub. It provides tenant-scoped email-code login, client profiles, Shopify product and customer sync, multi-project workspaces, project messaging, requests, uploads, invoices, and dashboard data.

## Railway services

- API service built from this repository
- PostgreSQL database exposed as `DATABASE_URL`
- Persistent volume mounted at `/data` for uploaded PDF, AI, image, and ZIP files

## Required variables

`DATABASE_URL`, `JWT_SECRET`

Production URLs:

- `WORK_HUB_URL=https://work.thefuturebasics.com`
- `CLIENT_HUB_URL=https://hub.thefuturebasics.com`
- `START_PROJECT_URL=https://thefuturebasics.com/pages/contact`
- `ALLOWED_ORIGINS=https://thefuturebasics.com,https://work.thefuturebasics.com,https://hub.thefuturebasics.com`

For live email codes also set `RESEND_API_KEY` and `AUTH_FROM_EMAIL`. Without Resend, codes are written to deploy logs for setup testing.

For Future Basics staff Google Workspace SSO, configure a Google OAuth 2.0 Web application with the authorized redirect URI `https://work.thefuturebasics.com/v1/auth/google/callback`, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. `GOOGLE_REDIRECT_URI` is optional when using the production URL. The server verifies Google's signed identity token, verified-email status, and the `thefuturebasics.com` hosted domain before issuing an admin session.

## Endpoints

- `GET /health`
- `GET /` — client gate on `hub.thefuturebasics.com`, staff UI on `work.thefuturebasics.com`
- `GET /clients/:id` — full-page staff client workspace
- `GET /hub` — client gate fallback
- `GET /admin` — staff UI fallback
- `POST /v1/auth/code` — `{ "email": "name@ouster.com" }`
- `POST /v1/auth/verify` — `{ "email": "...", "code": "123456" }`
- `GET /v1/auth/google/start` — begin Future Basics Google Workspace SSO
- `GET /v1/auth/google/callback` — Google OAuth callback
- `GET /v1/session` — current user and tenant, Bearer token
- `GET /v1/dashboard` — Bearer token
- `POST /v1/projects/:id/messages` — add a client message to a project thread, Bearer token
- `GET /v1/products/:id` — client product details, issued quote, and quote-decision readiness, Bearer token
- `POST /v1/quotes/:id/decision` — approve or decline a complete issued quote and notify the work console, Bearer token
- `POST /v1/requests` — Bearer token
- `POST /v1/requests/:id/files` — multipart field `file`, Bearer token

Each client can have multiple approved email domains and multiple active projects. Products belong to projects, and each project has a shared staff/client message thread. A domain can belong to only one client room. Future Basics staff authenticate with `thefuturebasics.com` and are routed to the internal operations hub. Client API reads and writes remain scoped to the `clientId` signed into the session token.
