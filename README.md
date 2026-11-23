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


## Postman API Collection

Complete Postman Collection and Environment files are provided in the root directory:
- `collabix-api.postman_collection.json`: Contains 145 requests organized into 18 modules with Zod-compliant sample request bodies, parameter placeholders, and auto-token extraction on login.
- `collabix-local.postman_environment.json`: Pre-configured environment variables (`baseUrl`, `accessToken`, etc.) for local development.

### How to Import into Postman:
1. Open Postman.
2. Click **Import** (top-left).
3. Drag & drop `collabix-api.postman_collection.json` and `collabix-local.postman_environment.json`.
4. Select the **Collabix Local Environment** in the environment selector (top-right).
5. Run the **02. Authentication & Session > Login** request; the `accessToken` and `organizationId` will automatically be extracted and stored for subsequent authorized requests.

To regenerate the collection after adding new routes:
```bash
npm run generate:postman
```
