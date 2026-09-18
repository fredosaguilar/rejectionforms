const db = require('../db');
const { deliverSigningLinks, pendingRecipients } = require('./delivery');

/* Daily reminders for documents still waiting on a signature.
 *
 * Every document that goes out is reminded; there is nothing to switch on. A
 * reminder goes at 3pm on business days, in the agency's own timezone. Nothing
 * is sent at the weekend — a signing request landing on a Sunday afternoon is
 * not a nudge, it is a nuisance.
 *
 * The cap remains, because an unattended loop pointed at a client's phone is a
 * way to lose a client. After MAX reminders the envelope stops nudging and
 * waits for the agent. Voiding a document stops its reminders immediately,
 * which is the way to honour a client who asks not to be contacted again.
 *
 * Environment:
 *   REMINDERS            'off' disables the scheduler entirely
 *   REMINDER_HOUR        hour of the day to send (default 15, i.e. 3pm)
 *   REMINDER_MAX         how many reminders before giving up (default 7)
 *   REMINDER_TIMEZONE    IANA zone for the hour and the weekday (default America/Los_Angeles)
 */

const TZ    = process.env.REMINDER_TIMEZONE || 'America/Los_Angeles';
const HOUR  = Math.min(23, Math.max(0, parseInt(process.env.REMINDER_HOUR || '15', 10) || 15));
const MAX   = Math.max(1, parseInt(process.env.REMINDER_MAX || '7', 10) || 7);

/* The hour where the agency is, so a reminder does not arrive at 3am. Reading
   it from the zone rather than computing an offset keeps it right across the
   daylight-saving change. */
function localHour(now = new Date()) {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: 'numeric', hour12: false,
  }).format(now);
  return parseInt(h, 10) % 24;
}

/* The weekday where the agency is, for the same reason the hour is read that
   way rather than computed. */
function localWeekday(now = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
}

function isBusinessDay(now = new Date()) {
  const d = localWeekday(now);
  return d !== 'Sat' && d !== 'Sun';
}

/* Envelopes that are opted in, still out for signature, and not reminded in
   the last 20 hours — a margin under 24 so a daily run never skips a day by
   drifting a few minutes later each time. */
function dueEnvelopes() {
  return db.query(
    `SELECT * FROM envelopes
      WHERE reminders_enabled = TRUE
        AND status = 'sent'
        AND reminder_count < $1
        AND (reminder_last_at IS NULL OR reminder_last_at < NOW() - INTERVAL '20 hours')
      ORDER BY id`, [MAX]).then((r) => r.rows);
}

function baseUrl() {
  return (process.env.APP_BASE_URL || '').replace(/\/$/, '');
}

/* One pass. Exported so it can be run and tested without waiting for a clock. */
async function runOnce({ force = false } = {}) {
  if (!force && !isBusinessDay()) return { skipped: 'not a business day', sent: 0 };
  if (!force && localHour() !== HOUR) return { skipped: 'outside the reminder hour', sent: 0 };
  if (!baseUrl()) {
    console.warn('reminders: APP_BASE_URL is not set, so signing links would be wrong — skipping');
    return { skipped: 'APP_BASE_URL is not set', sent: 0 };
  }

  const envs = await dueEnvelopes();
  let reminded = 0, failures = 0;

  for (const env of envs) {
    const recipients = await pendingRecipients(env.id);
    if (!recipients.length) {
      // Everyone signed; nothing to chase. Stop asking.
      await db.query(`UPDATE envelopes SET reminders_enabled = FALSE WHERE id = $1`, [env.id]);
      continue;
    }

    const { sent, failed } = await deliverSigningLinks({
      env, recipients, baseUrl: baseUrl(), kind: 'reminded', actor: 'reminder',
    });

    // Counted whether or not delivery succeeded: a channel that fails every
    // day should still run out of attempts rather than retry forever.
    await db.query(
      `UPDATE envelopes SET reminder_last_at = NOW(), reminder_count = reminder_count + 1 WHERE id = $1`,
      [env.id]);

    if (sent.length) reminded += 1;
    if (failed.length) failures += 1;
    console.log(`reminders: envelope ${env.id} "${env.title}" — sent ${sent.length}, failed ${failed.length}, ` +
                `reminder ${env.reminder_count + 1} of ${MAX}`);
  }

  return { considered: envs.length, sent: reminded, failed: failures };
}

let timer = null;

/* Checks hourly and sends in the configured hour, so the cadence survives a
   restart without needing to remember when it last woke up. */
function start() {
  if (process.env.REMINDERS === 'off') {
    console.log('reminders: disabled by REMINDERS=off');
    return null;
  }
  if (timer) return timer;

  const tick = () => runOnce().catch((e) => console.error('reminders:', e.message));
  timer = setInterval(tick, 60 * 60 * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 30 * 1000).unref?.();   // once shortly after boot, not during it
  console.log(`reminders: on — ${HOUR}:00 ${TZ} on business days, up to ${MAX} per document`);
  return timer;
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = { start, stop, runOnce, dueEnvelopes, localHour, localWeekday, isBusinessDay, MAX, HOUR, TZ };
