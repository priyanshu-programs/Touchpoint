# Deploying Touchpoint on free tiers

This is the setup the owner's instance uses: Vercel Hobby for the app, Neon Free for Postgres, and cron-job.org for the scheduler. Everything here is free.

Vercel's Hobby plan is for non-commercial personal use. If that does not fit how you use Touchpoint, run it with Docker instead (guide to follow in a later release).

## 1. Database (Neon)

1. Create a project at https://neon.tech in the region closest to you.
2. Copy the **pooled** connection string and change `sslmode=require` to `sslmode=verify-full`.

## 2. App (Vercel)

1. Go to https://vercel.com/new and import your copy of this repository.
2. Leave the framework and build settings as detected. `vercel.json` already sets the build command, which applies database migrations before each build.
3. Before the first deploy, add these environment variables for the Production environment. The build runs the database migrations, so it fails without them:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | The Neon connection string from step 1 |
   | `AUTH_SECRET` | 32+ random characters |
   | `CRON_SECRET` | 32+ random characters, different from `AUTH_SECRET` |

   Generate a secret with:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

   Do not set `APP_URL` on Vercel. The app reads the production domain from Vercel.

   Optional: `WEBSITE_RENDERER=off`. Some company websites send an empty page and build it in the browser. To read those, the app sends that page's address to Jina Reader (`r.jina.ai`, free, no key) and reads the drawn page it answers with. Set this to `off` if no company address should leave your instance; such sites then give only their description and logo.
4. Deploy, then open the production URL. The first visit asks you to create the owner account.

`vercel.json` pins functions to Singapore (`sin1`). Change `regions` to the Vercel region nearest your database before deploying if yours is elsewhere.

If you later add a custom domain, set `APP_URL` to it (for example `https://crm.example.com`) and redeploy.

## 3. Scheduler (cron-job.org)

Reminders and background work run when something calls the tick endpoint.

1. Create a free account at https://cron-job.org and add a cron job:

   | Setting | Value |
   |---|---|
   | URL | `https://YOUR-APP.vercel.app/api/jobs/tick` |
   | Schedule | Every 15 minutes |
   | Request method | `POST` |
   | Header | `Authorization: Bearer YOUR_CRON_SECRET` |

2. Run it once with "Test run". It should return status 200 and a body like `{"done":1,"retried":0,"failed":0}`.
3. In Touchpoint, open Settings → System status. Scheduler should read "Running".

Every 15 minutes keeps a Neon Free database inside its monthly compute allowance. A shorter interval keeps the database awake longer.

Vercel also calls the same endpoint once a day as a backup; that is configured in `vercel.json` and needs no setup.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Build fails with "DATABASE_URL is not set" (older versions: `url: ''`) | The project has no `DATABASE_URL` for Production. Add the variables under Settings → Environment Variables, then redeploy |
| Build fails with "Invalid or missing environment variables" | A variable from step 2 is missing or a secret is shorter than 32 characters |
| Build fails during `pnpm db:migrate` | `DATABASE_URL` is wrong or the database is unreachable |
| Sign-up or sign-in fails with an origin error | `APP_URL` is set to a different address than the one you are visiting; remove it or correct it |
| Tick returns 401 | The `Authorization` header does not match `Bearer ` + `CRON_SECRET` exactly |
| System status says "Not running" | No tick in the last 35 minutes; check the cron job's history |
