# Google manual checklist

Automated tests run against a fake Google server. This checklist is the one run against a real Google account, on the live site, and Phase 5 is accepted on its results. Fill in the Result column as each step is done.

## Before you start

- **Until step 4 passes, don't press Reconnect, Allow scheduling or Disconnect on the live site.** Each one starts the connection again, which restarts the 8 days.
- **Never press Disconnect or Remove on your local copy.** It uses the same Google client and account, so giving the access back there can end the live site's access too. When you've finished with the local copy, just leave it connected.
- Use made-up meeting names, and your own second email address as the guest. Don't invite a real client.

## Do now

| # | Step | You should see | Date | Result |
|---|---|---|---|---|
| 1 | In Google Calendar, add a meeting for later today called "Checklist call". Wait up to 15 minutes, then open Today on a computer and on a phone. | "Checklist call" in the Meetings card, on both. Opening it shows the time and "Open in Google Calendar". | | |
| 2 | In Google Calendar, add a meeting starting in about 5 minutes, called "Checklist with Maple", and invite the email address of one of your people. Once it has started and synced, open that person, then Activity. | "Checklist with Maple" in their activity, with a Meeting badge. | | |
| 3 | On that person's Activity tab, press Schedule meeting. Title "Checklist invite", guest your own second address, both boxes ticked. Press Continue, read the sentence, then press Schedule. | The meeting opens in Touchpoint. It's in Google Calendar with a Meet link, and your second address got exactly one invitation. | | |

Delete "Checklist call", "Checklist with Maple" and "Checklist invite" in Google Calendar afterwards. They leave Touchpoint at the next sync.

## On or after 2026-11-08 10:45 UTC (4:15 pm India time)

| # | Step | You should see | Date | Result |
|---|---|---|---|---|
| 4 | Ask Claude to read the connection. It reads `status`, `connected_at` and `last_refresh_at` from the live database, and no token. | Status is connected, the connection is at least 8 days old, and the last refresh is within the last day. | | |
| 5 | **Do this last, because it ends the connection.** At https://myaccount.google.com/connections, remove Touchpoint's access. Then, on the live site, open Settings → Integrations and press Test connection or Sync now. | The Expired state, and a banner on every page. Today, Tasks and your records all work, and the meetings are still there. Nothing new arrives from Google. | | |
| 6 | Press Reconnect and allow access, including adding meetings. | The banner goes, and Sync now works again. | | |

If step 4 fails, Phase 5 isn't accepted. Write down what happened and what the page said. A connection made while the client was still in Testing ends after 7 days, so an expired banner around 2026-11-07 would point there. In that case, reconnect once and start the 8 days again.

## Recording Google's answers

This is done once, on your own computer. It keeps the automated tests honest about what Google really sends.

1. Start the local copy with `corepack pnpm dev` and open http://localhost:3000/settings/integrations. If it isn't connected, connect it, and press Allow scheduling.
2. Stop the local copy, then run `corepack pnpm fixtures:google`.
3. It reads your calendar and makes one test event with no guests and nobody emailed, tries to make it again, then deletes it. It prints what was recorded. If it ever says to delete the test event by hand, do that: it's called "Touchpoint test event (deleted at once)", tomorrow.
4. Tell Claude it has run. Everything personal is replaced before the files are written, and Claude reads both files before they're committed.

Google's token answers are never recorded, because they would hold real tokens.
