import "./config/env.js";
import express from "express";
import test from "./test/stripe.test.js";
import { connectDB } from "./connection/db.connection.js";
import transactionRoutes from "./routes/transaction.routes.js";
import { startReconciliationScheduler } from "./worker/reconciliation.worker.js";

const app = express();
app.use(express.json());

app.use("/api/v1/transactions", transactionRoutes);

app.listen(3000, () => {
  console.log(`Server running on port 3000`);
  connectDB();
  startReconciliationScheduler();
  // test();
});
