# CloudDrive - Render Ready

## Deploy
1. Push this project to GitHub.
2. In Render create **New -> Web Service**.
3. Connect the GitHub repository.
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables in Render. Use `env.env` as the checklist.
7. Set `MONGODB_URI` to your MongoDB Atlas connection string.
8. Deploy.

## MongoDB Atlas
Use MongoDB Atlas and create a database user. Choose **Drivers -> Node.js** when copying the connection string.

Example:
`mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/clouddrive?retryWrites=true&w=majority`

If the password contains special characters, URL-encode them.

## Local
```bash
npm install
cp env.env .env
# edit .env
npm run seed
npm start
```

Open http://localhost:3000

## Demo seed
Admin and demo credentials come from environment variables:
- admin@example.com / ChangeMe123!
- demo@example.com / Demo123!

Change them before real use.

## Important Render storage note
This starter stores uploaded files on the server filesystem. For durable production cloud storage, replace the local storage adapter with persistent/object storage (S3-compatible storage, etc.). MongoDB stores metadata.
