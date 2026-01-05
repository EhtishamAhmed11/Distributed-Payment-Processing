import Bull from "bull";
import { pool } from "../connection/db.connection.js";
import stripe from "../config/stripe.client.js";
import { sendTransactionEmail } from "../services/email.service.js";
import { getTransactionDetailsForEmail } from "../utils/transaction.utils.js";

const reconciliationQueue = new Bull("reconciliation", {
  redis: {
    host: "localhost",
    port: 6379,
  },
});

reconciliationQueue.process(async (job) => {
  const { transaction_id } = job.data;

  console.log(`[Reconciliation] processing transaction ${transaction_id}`);
  let client;
  try {
    client = await pool.connect();
    const txResult = await client.query(
      `SELECT * FROM transactions WHERE transaction_id = $1`,
      [transaction_id]
    );
    if (txResult.rows.length === 0) {
      console.log(`[Reconciliation] Transaction ${transaction_id} not found`);

      return;
    }

    const transaction = txResult.rows[0];

    if (["successful", "failed", "cancelled"].includes(transaction.status)) {
      console.log(
        `[Reconciliation] Transaction ${transaction_id} already resolved: ${transaction.status}`
      );
      return;
    }

    if (!transaction.stripe_intent_id) {
      console.log(
        `[Reconciliation] Transaction ${transaction_id} has no stripe_intent_id, marking as failed`
      );
      await updateTransactionStatus(
        transaction_id,
        "failed",
        "No Stripe Intent ID",
        transaction.status
      );
      return;
    }
    const paymentIntent = await stripe.paymentIntents.retrieve(
      transaction.stripe_intent_id
    );

    console.log(
      `[Reconciliation] Stripe status for ${transaction_id}: ${paymentIntent.status}`
    );
    await logReconciliationAttempt(
      transaction_id,
      paymentIntent.status,
      transaction.status,
      null // no error
    );

    let newStatus = transaction.status;
    let errorMessage = null;

    switch (paymentIntent.status) {
      case "succeeded":
        newStatus = "successful";
        console.log(
          `[Reconciliation] ✅ Transaction ${transaction_id} succeeded`
        );

        break;
      case "canceled":
        newStatus = "cancelled";
        console.log(
          `[Reconciliation] ❌ Transaction ${transaction_id} cancelled`
        );
        break;
      case "requires_payment_method":
        newStatus = "failed";
        errorMessage =
          paymentIntent.last_payment_error?.message || "Payment Failed";
        console.log(
          `[Reconciliation] ❌ Transaction ${transaction_id} failed: ${errorMessage}`
        );
        break;
      case "requires_action":
      case "requires_confirmation":
      case "processing":
        newStatus = "under_review";
        console.log(
          `[Reconciliation] ⏳ Transaction ${transaction_id} still processing`
        );
        break;

      default:
        console.log(
          `[Reconciliation] Unknown Stripe status: ${paymentIntent.status}`
        );
    }
    if (newStatus !== transaction.status) {
      await updateTransactionStatus(
        transaction_id,
        newStatus,
        errorMessage,
        transaction.status
      );

      // Send email notification for resolved status
      if (["successful", "failed"].includes(newStatus)) {
        const emailDetails = await getTransactionDetailsForEmail(transaction_id);
        if (emailDetails) {
          await sendTransactionEmail(emailDetails);
        }
      }
    }
  } catch (error) {
    console.error(
      `[Reconciliation] Error processing transaction ${transaction_id}:`,
      error
    );

    await logReconciliationAttempt(transaction_id, null, null, error.message);

    throw error;
  }
});

async function updateTransactionStatus(
  transactionId,
  newStatus,
  errorMessage,
  oldStatus
) {
  await pool.query(
    `UPDATE transactions 
     SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP 
     WHERE transaction_id = $3`,
    [newStatus, errorMessage, transactionId]
  );

  console.log(
    `[Reconciliation] Updated transaction ${transactionId}: ${oldStatus} → ${newStatus}`
  );
}
async function logReconciliationAttempt(
  transactionId,
  stripeStatus,
  ourStatusBefore,
  errorMessage
) {
  let client = await pool.connect();
  const result = await client.query(
    `SELECT status FROM transactions WHERE transaction_id = $1`,
    [transactionId]
  );
  const ourStatusAfter = result.rows[0]?.status || null;
  await client.query(
    `INSERT INTO reconciliation_attempts 
     (transaction_id, stripe_status, our_status_before, our_status_after, error_message, checked_at) 
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [transactionId, stripeStatus, ourStatusBefore, ourStatusAfter, errorMessage]
  );
}

async function scheduleReconciliation() {
  try {
    let client = await pool.connect();
    const stuckTransactions = await client.query(`
        SELECT t.transaction_id,t.status,t.created_at FROM transactions t
        LEFT JOIN reconciliation_attempts ra ON t.transaction_id = ra.transaction_id
        WHERE t.status IN ('pending','under_review')
            AND t.created_at < NOW()-INTERVAL '5 minutes'
            AND (ra.checked_at IS NULL OR ra.checked_at < NOW() - INTERVAL '2 minutes')
        ORDER BY t.created_at ASC
        LIMIT 100`);
    console.log(
      `[Scheduler] Found ${stuckTransactions.rows.length} stuck transactions`
    );

    for (const tx of stuckTransactions.rows) {
      await reconciliationQueue.add(
        { transaction_id: tx.transaction_id },
        {
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 60000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
      console.log(
        `[Scheduler] Queued transaction ${tx.transaction_id} for reconciliation`
      );
    }
  } catch (error) {
    console.error("[Scheduler] Error scheduling reconciliation:", error);
  }
}
reconciliationQueue.on("failed", async (job, err) => {
  const { transaction_id } = job.data;

  console.error(
    `[Reconciliation] Job failed after ${job.attemptsMade} attempts for transaction ${transaction_id}:`,
    err.message
  );

  // After 5 failed attempts, mark as 'stuck'
  if (job.attemptsMade >= 5) {
    console.log(
      `[Reconciliation] Marking transaction ${transaction_id} as STUCK`
    );

    let client;
    client = await pool.connect();
    await client.query(
      `UPDATE transactions 
       SET status = 'stuck', error_message = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE transaction_id = $2`,
      [
        `Reconciliation failed after ${job.attemptsMade} attempts: ${err.message}`,
        transaction_id,
      ]
    );

    // Send alert email for stuck transaction
    const emailDetails = await getTransactionDetailsForEmail(transaction_id);
    if (emailDetails) {
      await sendTransactionEmail({ ...emailDetails, status: "stuck" });
    }
  }
});

function startReconciliationScheduler() {
  console.log(`[Reconciliation] Starting scheduler...`);

  scheduleReconciliation();
  setInterval(scheduleReconciliation, 60000);
}

export { reconciliationQueue, startReconciliationScheduler };
