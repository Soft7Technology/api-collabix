# ---------- CONFIG ----------

# Main dependencies
PACKAGES = bcryptjs cookie-parser cors dotenv express helmet jsonwebtoken morgan multer nodemailer pg zod

# Dev dependencies
DEV_PACKAGES = @types/bcryptjs @types/cookie-parser @types/cors @types/express @types/jsonwebtoken @types/morgan @types/multer @types/node @types/nodemailer @types/pg eslint globals rimraf tsx typescript typescript-eslint

.PHONY: install dev build start seed reset-db lint setup

# Install all dependencies
install:
	npm install $(PACKAGES) --save && npm install $(DEV_PACKAGES) --save-dev
	@echo "All backend packages installed!"

# Start the Express dev server
dev:
	npm run dev

# Build the TypeScript project for production
build:
	npm run build

# Start production server
start:
	npm start

# Seed the Superadmin user inside the database
seed:
	npm run seed-admin

# Reset database tables and seed
reset-db:
	npx tsx src/reset-db.ts

# Lint backend code
lint:
	npm run lint

# One-command full setup
setup:
	@echo "🔄 Running backend setup..."
	make install
	make build
	make reset-db
	@echo "🚀 Starting backend dev server..."
	make dev
