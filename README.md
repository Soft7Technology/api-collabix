# Collabix API

The single backend for both Collabix frontends. It owns authentication,
database migrations, customer APIs, and the super-admin API under
`/api/super/*`.

## Development

1. Copy `.env.example` to `.env` and configure PostgreSQL.
2. Run `npm install`.
3. Run `npm run dev`.

Database migrations run when the service starts. Create the first platform
administrator with `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`, then run
`npm run seed-admin`.

## Production

Set unique JWT secrets of at least 32 characters and list both exact frontend
origins in `FRONTEND_URLS`. Deploy over HTTPS and run only one migration owner
during rollout.
