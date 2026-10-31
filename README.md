# ReachInbox Email Scheduler

A small slice of a cold-email system: you sign in with Google, upload leads, and the backend sends them later through Ethereal. Timers live in Redis via BullMQ. The database remembers every message so a restart does not start over and does not send the same message twice.

There is no cron. Nothing in this repo imports `node-cron`, Agenda, or an OS crontab.

## Feature map

| Requirement | Where it lives |
| --- | --- |
| Schedule from an API and keep the row in Postgres | `POST /api/campaigns`, Prisma `EmailJob` |
| BullMQ delayed jobs, no cron | `backend/src/lib/queue.ts`, `backend/src/worker.ts` |
| Survive a restart | Redis holds the delayed job. `reconcileScheduledEmails()` rebuilds missing jobs from Postgres when the worker boots |
| Do not send twice | BullMQ job id is the email id. The worker returns immediately when `status` is `sent` or a provider message id exists |
| Several senders | Ethereal mailboxes stored on `Sender`. Leads are split round-robin |
| Worker concurrency | `WORKER_CONCURRENCY` |
| Minimum gap between sends | `MIN_SEND_DELAY_MS` (default 2 seconds), enforced in Redis per sender |
| Hourly cap, configurable | `MAX_EMAILS_PER_HOUR_PER_SENDER` and the compose-form limit. The lower number wins |
| Do not drop mail when the cap is hit | Status becomes `rescheduled` and the BullMQ job is moved to the next hour |
| Slack when a sender hits the cap | Real Slack OAuth (`incoming-webhook`). No Slack connection means no message and no crash |
| Elasticsearch search | Index `reachinbox-emails`. The search box uses it when Elasticsearch is up |
| Live queue dashboard | `http://localhost:4000/admin/queues` (basic auth) |
| Google login, header, logout | Real Google OAuth. Cookie session. No mock success |
| Compose, CSV leads, scheduled and sent views | Frontend dashboard |

## Run it

You need Node.js 20+, plus Postgres, Redis, and Elasticsearch.

### 1. Start the data stores

```bash
docker compose up -d
```

Redis is started with append-only mode, so delayed jobs are still there after Redis restarts.

On a machine without Docker you can run your own Postgres, Redis, and Elasticsearch and point `.env` at them.

### 2. Configure secrets

```bash
cp .env.example .env
```

Fill in `JWT_SECRET`, `BULL_BOARD_PASSWORD`, and the Google and Slack apps. Leave the Google and Slack values empty only while you are reading the code. Login and Slack connect will not succeed until they are real.

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Install, migrate, and start

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
npm --prefix backend exec prisma generate
npm run db:migrate
npm run dev
```

`npm run dev` starts the API on port 4000, the BullMQ worker, and the UI.

Open the UI at http://localhost:5173. The UI proxies `/api` to the API.

The queue board is http://localhost:4000/admin/queues. The browser will ask for `BULL_BOARD_USER` and `BULL_BOARD_PASSWORD`.

### Google OAuth

1. In Google Cloud Console, create an OAuth client of type **Web application**.
2. Authorized redirect URI: `http://localhost:4000/api/auth/google/callback` (the same value as `GOOGLE_CALLBACK_URL`).
3. Consent screen scopes: openid, email, profile.
4. Put the client id and secret in `.env` and restart the API.

Sign-in redirects to Google, then back to the dashboard. The session is an httpOnly cookie. Logout clears it.

The email and password fields are on the sign-in screen because that layout is part of the design. Submitting them does **not** sign you in. The assignment asks for Google, and a fake password success would be a mock.

### Slack OAuth

1. Create an app at https://api.slack.com/apps.
2. Add a redirect URL: `http://localhost:4000/api/slack/callback`.
3. Bot token scope: `incoming-webhook`.
4. Put the client id and secret in `.env` and restart the API.
5. In the dashboard, open **Slack Alerts** and choose **Connect Slack**. Pick the channel in Slack's own screen.

Disconnect leaves the fields empty. Later connects start working without a redeploy because the worker reads the webhook from Postgres on each rate-limit hit.

### Ethereal

You do not create an Ethereal account by hand. The first time a user opens Compose (or hits `POST /api/senders/ensure`), the API calls Ethereal and stores two real SMTP mailboxes. Sent rows include a preview URL. Open it to see the message Ethereal accepted.

## Plain-language architecture

### Redis

Redis is a very fast notebook that every API process and every worker can read at the same time. BullMQ stores its job list there. This app also stores three other things there:

- the hourly send counter
- the "next time this sender is allowed to send" timestamp
- the one-time Slack alert lock

Those values survive a Node restart because they are not kept in a JavaScript variable.

### BullMQ

BullMQ is a queue. A job can be given a delay, for example "become available at 16:10". When the delay ends, a worker process picks it up. If you run five workers, or one worker with concurrency 5, Redis still hands each job to only one of them.

Delayed jobs stay in Redis until they run. Stopping the Node process does not delete them. Starting the worker again continues the same jobs. That is the restart behavior, and it is why this project does not use cron.

`QueueScheduler` from old BullMQ tutorials is not used. BullMQ 5 workers handle delays themselves.

### Prisma

Prisma is the typed layer over Postgres. `schema.prisma` describes the tables. The generated client is what the API calls instead of writing SQL by hand. Postgres is the source of truth for "who should receive what, and did it already go out?"

### What happens when you press Schedule

1. The API pulls email addresses out of the pasted text or CSV and drops duplicates inside that one upload.
2. It plans a send time for each lead. Senders take turns. Each sender waits at least `MIN_SEND_DELAY_MS` (and whatever larger gap you typed). Each sender also stops at the hourly cap and continues in the next clock hour. Nobody is removed from the list.
3. One database transaction inserts the campaign and every email row.
4. Each row becomes a BullMQ job whose id is the email id and whose delay is `scheduledAt - now`.
5. The same rows are indexed in Elasticsearch.

If the request is repeated with the same `Idempotency-Key` header, the API returns the original campaign instead of creating a second one.

### What the worker does for one job

1. Load the row. If it is already sent, stop.
2. If `scheduledAt` is still in the future, move the job back to that time.
3. Ask Redis for the next legal send instant for this sender. If that instant is still ahead, wait. Parallel workers share this timestamp, so two workers cannot fire the same sender together.
4. Ask Redis to add one to this sender's hourly counter, and one to this campaign's counter. The add happens inside a Redis script, so the check and the increment cannot be split by another worker.
5. If either counter is already at the cap, put the counter back (when we had incremented the sender but the campaign was full), mark the row `rescheduled`, move the job to the next hour, and post to Slack once for that sender-hour if a webhook exists.
6. Otherwise claim the row (`scheduled` or `rescheduled` becomes `sending`). Send through that sender's Ethereal SMTP account. Save the provider message id and preview URL. Mark it `sent`.
7. If SMTP throws, give the hourly slots back and let BullMQ retry with exponential backoff. The last retry marks the row `failed`.

### 1000 emails at once

The planner does not try to send them in one burst. With 2 senders, a 2 second gap, and a cap of 200 per sender per hour, 1000 leads occupy three clock hours. You can print that summary with:

```bash
npm run plan:demo
```

You do not need to send 1000 messages through Ethereal to see the shape. The unit test `planSendSlots` locks the same numbers in.

### Idempotency and restarts

- The queue job id is the email id, so adding it twice does not create two jobs.
- The worker refuses to send a row that already has `providerMessageId`.
- A crash during `sending`, before a message id was saved, is put back to `scheduled` after two minutes when the worker starts, then tried again. If Ethereal had already accepted the message and the process died before the database update, that one message can be delivered twice. That window is the crash between SMTP success and the database commit. It is called out here on purpose.

If Redis itself is wiped, start the worker. It looks for rows that are not sent and are missing a job, then enqueues them at their saved `scheduledAt`. It takes a Redis lock so two workers do not rebuild the queue at the same moment.

## Tests

```bash
npm test
npm run typecheck
npm --prefix backend run smoke
```

`npm test` covers the planner (including 1000 leads), CSV parsing, the Redis hourly counter, a Postgres + BullMQ schedule with an idempotency replay, and a scan that forbids cron imports.

`smoke` creates a real Ethereal mailbox, sends one message, fills the Redis hourly counter, and checks that the next message is kept as `rescheduled` instead of being sent or deleted. It needs network access to Ethereal.

## Environment variables

See `.env.example`. The limits that matter in review:

| Variable | Meaning |
| --- | --- |
| `WORKER_CONCURRENCY` | Jobs one worker process may run at the same time. Default 5. Different senders can send in parallel. One sender still waits for the gap. |
| `MIN_SEND_DELAY_MS` | Minimum gap for a single sender. Default 2000. |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Hard cap. The compose form cannot raise it. Default 200. |
| `EMAIL_MAX_ATTEMPTS` | SMTP retries inside BullMQ. Default 5. |

Hour windows are UTC hours. The dashboard shows your local time.

## Trade-offs

- Elasticsearch is required for search when it is running. If it is down, search falls back to Postgres `ILIKE` and the screen says so. Scheduling still works.
- Slack tokens and Ethereal passwords sit in Postgres. That is acceptable for this assignment on your machine. A production system would encrypt them.
- The sign-in screen shows an email/password form and then refuses it. Google is the only login.
- Slack is an OAuth connect button, not a box where you paste a webhook, because the brief asks for the authorize flow.
- The Figma file (`kOTwGlESjijCYnMgtHfvfU`, node `59-4050`) is behind a login, so this environment could not open the source frames. The UI follows that assignment's published layout: ONE wordmark, `#00b050` accent, left rail, compose dialog, split list and detail, BullMQ and Slack utilities.
- Collaborator invites for `Mitrajit` and `Yadav036`, the ClickUp submission form, and the 5 minute demo video have to be done from your GitHub and your machine. This repo cannot click those for you.

## Interview notes

- Why Redis for the cap: an in-memory `number` inside Node resets on restart and is invisible to a second worker. `INCR` on a key named by sender and hour is one atomic counter shared by every process.
- Why the job is delayed instead of failed: a failure burns a retry and can land in the failed set. `moveToDelayed` keeps the same job and the same id, so it still cannot be sent twice.
- Why Postgres and Redis both exist: Redis is a timer. Postgres is the record. Either one can be rebuilt from the other except for the rare crash described above.
- Why concurrency does not mean "send 5 emails from one mailbox at once": the gap is per sender. Concurrency overlaps SMTP waits and different mailboxes.
- What you would say if asked about cron: a cron tick asks "is it time?" every minute and then has to invent its own locking. BullMQ already stores the timestamp and the lock.

## Project layout

```
backend/src        Express API, BullMQ worker, rate limit, OAuth
backend/prisma     Postgres schema
backend/tests      Planner, CSV, Redis cap, schedule integration
frontend/src       React dashboard
examples/leads.csv Sample lead file
docker-compose.yml Postgres, Redis, Elasticsearch
```
