import { pool } from "../connection/db.connection.js";

/**
 * Fetches transaction details along with sender and receiver name/email.
 * @param {string|number} transactionId 
 * @returns {Promise<Object|null>}
 */
export const getTransactionDetailsForEmail = async (transactionId) => {
    const query = `
    SELECT 
      t.transaction_id,
      t.amount_cents,
      t.currency,
      t.status,
      t.created_at,
      u_sender.name as sender_name,
      u_sender.email as sender_email,
      u_receiver.name as receiver_name
    FROM transactions t
    JOIN users u_sender ON t.sender_user_id = u_sender.user_id
    JOIN users u_receiver ON t.receiver_user_id = u_receiver.user_id
    WHERE t.transaction_id = $1
  `;

    const result = await pool.query(query, [transactionId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
        transactionId: row.transaction_id.toString(),
        amount: (Number.parseInt(row.amount_cents) / 100).toFixed(2),
        currency: row.currency,
        status: row.status,
        date: new Date(row.created_at).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        }),
        userName: row.sender_name,
        email: row.sender_email,
        receiverName: row.receiver_name || `User #${row.receiver_user_id}`,
    };
};
