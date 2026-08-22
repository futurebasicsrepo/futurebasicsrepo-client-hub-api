# Future Basics Client Hub API

Backend for the Future Basics Shopify client hub. It provides tenant-scoped email-code login, requests, uploads, invoices, projects, and dashboard data.

## Railway services

- API service built from this repository
- PostgreSQL database exposed as `DATABASE_URL`
- Persistent volume mounted at `/data` for uploaded PDF, AI, image, and ZIP files

## Required variables

`DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS=https://thefuturebasics.com`

For live email codes also set `RESEND_API_KEY` and `AUTH_FROM_EMAIL`. Without Resend, codes are written to deploy logs for setup testing.

## Endpoints

- `GET /health`
- `POST /v1/auth/code` — `{ "email": "name@ouster.com" }`
- `POST /v1/auth/verify` — `{ "email": "...", "code": "123456" }`
- `GET /v1/dashboard` — Bearer token
- `POST /v1/requests` — Bearer token
- `POST /v1/requests/:id/files` — multipart field `file`, Bearer token

The initial client seed accepts `ouster.io` and `ouster.com`.
