import { startReconciliationScheduler } from "./reconciliation.worker.js";

console.log(`Starting reconciliation worker`)
startReconciliationScheduler()