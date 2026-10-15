import { pool } from "../db/index.js";
import { RazorpayService } from "./razorpayService.js";

export class SubscriptionService {
  // True if this Razorpay event belongs to an old subscription that a plan change has replaced or is about to replace
  public static async isSupersededByPlanChange(
    razorpaySubscriptionId: string,
  ) {
    const { rows } = await pool.query(
      `SELECT s.status,
            EXISTS (
              SELECT 1 FROM subscriptions n
              WHERE n.organization_id = s.organization_id AND n.status = 'scheduled'
            ) AS has_scheduled
     FROM subscriptions s
     WHERE s.razorpay_subscription_id = $1`,
      [razorpaySubscriptionId],
    );
    const row = rows[0];
    if (!row) return false;
    return ["cancelled", "expired"].includes(row.status) || row.has_scheduled;
  }

  public static async handleIncomingSubscriptionEvent(
    event: string,
    subscription: any,
    incoming: any,
  ) {
    switch (event) {
      case "subscription.authenticated": {
        // Downgrade / cycle change: customer authorized a future-dated subscription.
        // Upgrades wait for the first charge instead.
        const startsLater =
          incoming.current_period_start &&
          new Date(incoming.current_period_start) > new Date();
        if (startsLater && incoming.status === "incoming") await SubscriptionService.markScheduled(incoming);
        break;
      }

      case "subscription.activated":
      case "subscription.charged":
        await SubscriptionService.promoteIncomingSubscription(
          incoming,
          subscription,
        );
        break;

      case "subscription.halted":
      case "subscription.cancelled": {
  const wasScheduled = incoming.status === "scheduled";
  const startPassed =
    incoming.current_period_start && new Date(incoming.current_period_start) <= new Date();

  await pool.query(
    `UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2`,
    [event === "subscription.halted" ? "failed" : "cancelled", incoming.id],
  );

  // The old subscription already ended and its cancelled event was skipped, so close it out now
  if (wasScheduled && startPassed) {
    await pool.query(
      `UPDATE subscriptions SET status = 'expired', updated_at = NOW()
       WHERE organization_id = $1 AND id <> $2 AND status IN ('active', 'paused', 'pending')`,
      [incoming.organization_id, incoming.id],
    );
    await pool.query(
      `UPDATE organizations SET subscription_status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
      [incoming.organization_id],
    );
  }
  break;
}

      default:
        console.log(
          `Ignored ${event} for incoming subscription ${subscription.id}`,
        );
    }
  }

  public static async markScheduled(incoming: any) {
    await pool.query(
      `UPDATE subscriptions SET status = 'scheduled', updated_at = NOW()
     WHERE id = $1 AND status = 'incoming'`,
      [incoming.id],
    );

    const old = (
      await pool.query(
        `SELECT razorpay_subscription_id FROM subscriptions
       WHERE organization_id = $1 AND id <> $2 AND status IN ('active', 'paused', 'pending')`,
        [incoming.organization_id, incoming.id],
      )
    ).rows[0];

    if (old) {
      // Old plan runs to the end of its paid period, then ends
      await RazorpayService.cancelRazorpaySubscription(
        old.razorpay_subscription_id,
        true,
      ).catch((e) =>
        console.error(
          "ALERT: could not schedule cancel of old subscription (ignore if already scheduled):",
          old.razorpay_subscription_id,
          e.message,
        ),
      );
    }
  }

  public static async promoteIncomingSubscription(
    incoming: any,
    subscription: any,
  ) {
    const client = await pool.connect();
    let oldRazorpayId: string | undefined;
    let wasScheduled = false;

    try {
      await client.query("BEGIN");

      // Lock and re-check so duplicate or concurrent deliveries promote only once
      const locked = await client.query(
        `SELECT status FROM subscriptions WHERE id = $1 FOR UPDATE`,
        [incoming.id],
      );
      const currentStatus = locked.rows[0]?.status;
      if (!["incoming", "scheduled"].includes(currentStatus)) {
        await client.query("ROLLBACK");
        return;
      }
      wasScheduled = currentStatus === "scheduled";

      // Retire the old row first: only one active row per org is allowed
      const oldRes = await client.query(
        `UPDATE subscriptions
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE organization_id = $1 AND id <> $2 AND status IN ('active', 'paused')
       RETURNING razorpay_subscription_id`,
        [incoming.organization_id, incoming.id],
      );
      oldRazorpayId = oldRes.rows[0]?.razorpay_subscription_id;
      console.log("old res", oldRes)

      await client.query(
        `UPDATE subscriptions
       SET status = 'active',
           razorpay_customer_id = COALESCE($1, razorpay_customer_id),
           current_period_start = $2,
           current_period_end = $3,
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = $4`,
        [
          subscription.customer_id ?? null,
          subscription.current_start
            ? new Date(subscription.current_start * 1000)
            : null,
          subscription.current_end
            ? new Date(subscription.current_end * 1000)
            : null,
          incoming.id,
        ],
      );

      await client.query(
        `UPDATE organizations SET subscription_status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
        [incoming.organization_id],
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e; // 5xx, so Razorpay retries the webhook
    } finally {
      client.release();
    }

    // Upgrade: stop billing on the old Razorpay subscription now.
    // Downgrade: it already ended at its period end, so skip.
    if (oldRazorpayId && !wasScheduled) {
      await RazorpayService.cancelRazorpaySubscription(
        oldRazorpayId,
        false,
      ).catch((e) =>
        console.error(
          "ALERT: old subscription not cancelled, may double-bill:",
          oldRazorpayId,
          e.message,
        ),
      );
    }
  }
}
