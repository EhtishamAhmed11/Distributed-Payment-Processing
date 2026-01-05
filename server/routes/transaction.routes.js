import express from "express";
import {
    createTransaction,
    getTransactionById,
    getTransactions,
    cancelTransaction,
} from "../controller/transaction.controller.js";
const router = express.Router();

router.route("/").post(createTransaction).get(getTransactions);
router.route("/:id").get(getTransactionById);
router.route("/:id/cancel").post(cancelTransaction);

export default router;
