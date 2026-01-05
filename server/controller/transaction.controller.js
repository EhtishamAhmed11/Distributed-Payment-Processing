import stripe from "../config/stripe.client.js";
import { pool } from "../connection/db.connection.js";
import { sendTransactionEmail } from "../services/email.service.js";
import { getTransactionDetailsForEmail } from "../utils/transaction.utils.js";

export const createTransaction = async (req, res) => {
  let client;
  try {
    let {
      amount_cent,
      description,
      currency,
      sender_user_id,
      receiver_user_id,
      idempotency_key,
    } = req.body;

    amount_cent = Number.parseInt(amount_cent);
    sender_user_id = Number.parseInt(sender_user_id);
    receiver_user_id = Number.parseInt(receiver_user_id);
    currency = typeof currency === "string" ? currency.toLowerCase() : null;
    description = typeof description === "string" ? description.trim() : null;
    idempotency_key =
      typeof idempotency_key === "string" ? idempotency_key.trim() : null;
    if (!Number.isInteger(amount_cent) || amount_cent <= 0) {
      return res.status(400).json({ message: "Invalid amount_cent" });
    }

    if (!currency || !sender_user_id || !receiver_user_id || !idempotency_key) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (sender_user_id === receiver_user_id) {
      return res
        .status(400)
        .json({ message: "Sender and receiver cannot be same" });
    }

    const checkQuery = `SELECT * FROM transactions WHERE idempotency_key=$1`;

    client = await pool.connect();
    const existingResult = await client.query(checkQuery, [idempotency_key]);

    if (existingResult.rows.length > 0) {
      console.log(`Idempotent request detected: ${idempotency_key}`);
      return res.status(200).json({
        message: "Transaction already exists (idempotent)",
        transaction: existingResult.rows[0],
      });
    }

    const insertQuery = `INSERT INTO transactions (amount_cents,description,currency,sender_user_id,receiver_user_id,idempotency_key,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`;

    const insertResult = await client.query(insertQuery, [
      amount_cent,
      description,
      currency,
      sender_user_id,
      receiver_user_id,
      idempotency_key,
      "pending",
    ]);

    const transaction = insertResult.rows[0];
    console.log(`Transaction Created:${transaction.transaction_id}`);

    let paymentIntent;

    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amount_cent,
        currency: currency,
        description: description || `Payment from user:${sender_user_id}`,
        metadata: {
          transaction_id: transaction.transaction_id.toString(),
          sender_user_id: sender_user_id.toString(),
          receiver_user_id: receiver_user_id.toString(),
        },
      });
      console.log(`Stripe Payment created:${paymentIntent.id}`);
    } catch (stripeError) {
      await client.query(
        `UPDATE transactions SET status = 'failed', error_message = $1 WHERE transaction_id = $2`,
        [stripeError.message, transaction.transaction_id]
      );

      // Send failure email
      const emailDetails = await getTransactionDetailsForEmail(transaction.transaction_id);
      if (emailDetails) {
        await sendTransactionEmail(emailDetails);
      }

      return res.status(500).json({
        message: "Failed to create payment intent",
        error: stripeError.message,
      });
    }
    await client.query(
      `UPDATE transactions SET stripe_intent_id=$1 WHERE transaction_id = $2`,
      [paymentIntent.id, transaction.transaction_id]
    );
    return res.status(201).json({
      message: "Transaction created",
      transaction: {
        transaction_id: transaction.transaction_id,
        amount_cents: transaction.amount_cents,
        currency: transaction.currency,
        status: transaction.status,
        created_at: transaction.created_at,
      },
      client_secret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Transaction error:", error);
    return res.status(500).json({
      message: "Transaction failed",
      error: error.message,
    });
  } finally {
    if (client) client.release();
  }
};

export const getTransactionById = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await pool.connect();
    const result = await client.query(
      "SELECT * FROM transactions WHERE transaction_id = $1 OR transaction_uuid::text = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    return res.status(200).json({
      message: "Transaction retrieved",
      transaction: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching transaction:", error);
    return res.status(500).json({
      message: "Failed to fetch transaction",
      error: error.message,
    });
  } finally {
    if (client) client.release();
  }
};

export const getTransactions = async (req, res) => {
  let client;
  try {
    let { page = 1, limit = 20, status, sender_user_id } = req.query;

    page = Math.max(1, Number.parseInt(page));
    limit = Math.max(1, Math.min(100, Number.parseInt(limit)));
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM transactions WHERE 1=1";
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (sender_user_id) {
      params.push(sender_user_id);
      query += ` AND sender_user_id = $${params.length}`;
    }

    // Add ordering and pagination
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2
      }`;
    params.push(limit, offset);

    client = await pool.connect();
    const result = await client.query(query, params);

    // Get total count for pagination metadata
    let countQuery = "SELECT COUNT(*) FROM transactions WHERE 1=1";
    const countParams = [];
    if (status) {
      countParams.push(status);
      countQuery += ` AND status = $${countParams.length}`;
    }
    if (sender_user_id) {
      countParams.push(sender_user_id);
      countQuery += ` AND sender_user_id = $${countParams.length}`;
    }
    const countResult = await client.query(countQuery, countParams);
    const totalTransactions = Number.parseInt(countResult.rows[0].count);

    return res.status(200).json({
      message: "Transactions retrieved",
      transactions: result.rows,
      pagination: {
        total: totalTransactions,
        page,
        limit,
        pages: Math.ceil(totalTransactions / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return res.status(500).json({
      message: "Failed to fetch transactions",
      error: error.message,
    });
  } finally {
    if (client) client.release();
  }
};

export const cancelTransaction = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await pool.connect();

    // 1. Fetch transaction and check status
    const result = await client.query(
      "SELECT * FROM transactions WHERE (transaction_id = $1 OR transaction_uuid::text = $1) FOR UPDATE",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    const transaction = result.rows[0];

    if (transaction.status !== "pending") {
      return res.status(400).json({
        message: `Cannot cancel transaction in ${transaction.status} status. Only pending transactions can be cancelled.`,
      });
    }

    // 2. Cancel in Stripe if stripe_intent_id exists
    if (transaction.stripe_intent_id) {
      try {
        await stripe.paymentIntents.cancel(transaction.stripe_intent_id);
        console.log(`Stripe PaymentIntent cancelled: ${transaction.stripe_intent_id}`);
      } catch (stripeError) {
        console.error("Stripe cancellation error:", stripeError);
        // If it's already cancelled or succeeded, handle accordingly
        // For now, we'll continue but possibly note it
      }
    }

    // 3. Update database status
    const updateResult = await client.query(
      "UPDATE transactions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE transaction_id = $1 RETURNING *",
      [transaction.transaction_id]
    );

    return res.status(200).json({
      message: "Transaction cancelled successfully",
      transaction: updateResult.rows[0],
    });
  } catch (error) {
    console.error("Error cancelling transaction:", error);
    return res.status(500).json({
      message: "Failed to cancel transaction",
      error: error.message,
    });
  } finally {
    if (client) client.release();
  }
};
