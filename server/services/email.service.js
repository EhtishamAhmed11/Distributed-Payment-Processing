import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Sends a transaction notification email.
 * @param {Object} details - The transaction and user details.
 * @param {string} details.email - Recipient email.
 * @param {string} details.userName - Recipient name.
 * @param {number} details.amount - Amount in decimal format.
 * @param {string} details.currency - Currency code.
 * @param {string} details.status - Transaction status.
 * @param {string} details.transactionId - Transaction ID.
 * @param {string} details.receiverName - Receiver's name or ID.
 * @param {string} details.date - Formatted date of transaction.
 */
export const sendTransactionEmail = async (details) => {
    const {
        email,
        userName,
        amount,
        currency,
        status,
        transactionId,
        receiverName,
        date,
    } = details;

    let subject = "";
    let statusText = status.charAt(0).toUpperCase() + status.slice(1);

    if (status === "successful") {
        subject = `Payment Successful - ${amount} ${currency.toUpperCase()}`;
    } else if (status === "failed") {
        subject = `Payment Failed - ${amount} ${currency.toUpperCase()}`;
    } else if (status === "stuck") {
        subject = `Alert: Payment Stuck - ${amount} ${currency.toUpperCase()}`;
        statusText = "Under Review (Stuck)";
    } else {
        subject = `Payment Update: ${statusText} - ${amount} ${currency.toUpperCase()}`;
    }

    const formattedAmount = `${amount} ${currency.toUpperCase()}`;
    const viewLink = `https://yourapp.com/transactions/${transactionId}`;

    const body = `Hi ${userName},

Your payment of ${formattedAmount} to ${receiverName} has been ${status === "stuck" ? "marked as stuck after multiple retry attempts" : statusText.toLowerCase() + "ly processed"}.

Transaction ID: ${transactionId}
Amount: ${formattedAmount}
Status: ${statusText}
Date: ${date}

View details: ${viewLink}

Thanks!`;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: subject,
        text: body,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Email sent: ${info.messageId} for transaction ${transactionId}`);
        return info;
    } catch (error) {
        console.error(`[EmailService] Error sending email for transaction ${transactionId}:`, error);
        // We don't want to throw here to avoid breaking the main flow, 
        // but we log it.
    }
};
