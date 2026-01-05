import stripe from "../config/stripe.client.js";
import { pool } from "../connection/db.connection.js";

async function confirmLatestPayment() {
  try {
    let client = await pool.connect();

    const result = await client.query(
      `SELECT transaction_id, stripe_intent_id FROM transactions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      console.log("No pending transactions found");
      return;
    }
    const tx = result.rows[0];
    console.log(`Confirming payment for transaction ${tx.transaction_id}`);
    console.log(`Stripe Intent ID: ${tx.stripe_intent_id}`);

    const confirmPayment = await stripe.paymentIntents.confirm(
      tx.stripe_intent_id,
      {
        payment_method: "pm_card_visa",
        return_url: "https://example.com/return",
      }
    );
    console.log("\n✅ Payment confirmed!");
    console.log("Status:", confirmPayment.status);
  } catch (error) {
    console.log("Error:", error.message);
  }
}
confirmLatestPayment();
