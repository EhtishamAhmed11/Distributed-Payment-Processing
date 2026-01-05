import stripe from "../config/stripe.client.js";

const test = async () => {
  try {
    console.log("Testing Stripe connection...");

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // $10.00 (amount in cents)
      currency: "usd",
      payment_method_types: ["card"],
      description: "Test payment",
    });
    console.log('Payment Intent ID:', paymentIntent.id);
    console.log('Status:', paymentIntent.status);
    console.log('Amount:', paymentIntent.amount / 100, paymentIntent.currency.toUpperCase());
    console.log("Stripe connection successful.");
  } catch (error) {
    console.log(`error:${error.message}`);
  }
};
export default test;
