# Render + MongoDB deployment

## Render environment variables

Do not upload `env.env` as a secret file. Open Render:
Service -> Environment -> Add Environment Variable.

Add:

MONGODB_URI = your MongoDB Atlas connection string
JWT_SECRET = a long random secret
NODE_ENV = production
CORS_ORIGIN = *
MAX_FILE_SIZE = 524288000
STORAGE_QUOTA = 16106127360
TRASH_RETENTION_DAYS = 30
ADMIN_EMAIL = your admin email
ADMIN_PASSWORD = your admin password
DEMO_EMAIL = demo@example.com
DEMO_PASSWORD = your demo password

## Build and start

Build:
npm install

Start:
npm start

## MongoDB Atlas

Choose:
Connect -> Drivers -> Node.js

Copy the `mongodb+srv://...` URI and replace USERNAME/PASSWORD.

Never commit a real password or JWT secret to GitHub.

## Seed

After the first successful deployment, run `npm run seed` once in an environment that can reach MongoDB. If your Render plan does not provide a shell, run the seed locally using the same MongoDB Atlas URI, then deploy.
