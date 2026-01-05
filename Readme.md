Payment Reconciliation System

A distributed system that prevents double charges and ensures payment consistency when payment gateway APIs fail or timeout.


📖 The Problem
I experienced this issue firsthand: I ordered a sweater online and when the delivery arrived, I sent payment through my bank app (UBL) to the rider's Easypaisa account. The app displayed an error saying "Transaction could not be completed," but seconds later, I received an email confirmation that the payment was successful.
What if I had clicked "retry" after seeing the error? I would have been charged twice.
This is a common problem in payment systems:

Payment succeeds on the gateway side (Stripe, PayPal, bank)
Network timeout or server crash prevents your system from receiving confirmation
Your database shows payment as "pending" while money was actually transferred
User might retry and get charged multiple times

This system solves that problem.

🎯 The Solution
This payment reconciliation system implements three key strategies:
1. Idempotency Keys
Every transaction has a unique idempotent key. If the same request is sent twice (due to retry), the system returns the original transaction instead of creating a duplicate.
2. Pending State Management
Transactions start in a "pending" state until confirmed. If confirmation never arrives, the transaction remains pending rather than being assumed successful or failed.
3. Background Reconciliation
A background worker periodically checks "stuck" pending transactions by querying the payment provider directly (Stripe). If the payment actually succeeded, the system updates the database automatically.
Result: No double charges. No lost payments. No manual intervention needed.



Data Flow

Transaction Creation

User initiates payment via API
System creates transaction record with idempotent key (status: pending)
System calls Stripe to create PaymentIntent
If successful response: Update to successful, send confirmation email
If timeout/error: Transaction stays pending


Reconciliation (Background Worker)

Runs every 1 minute
Finds transactions in pending state for >5 minutes
Queries Stripe API for actual payment status
Updates database to match Stripe's reality
Sends appropriate notification email
After 5 failed reconciliation attempts: marks as stuck (requires manual review)

Tech Stack
Backend:

Node.js + Express.js - REST API server
PostgreSQL - Relational database for transactions and audit logs

Job Queue:

Bull (Redis-based) - Background job processing with retry logic

External Services:
Stripe - Payment processing (test mode)
SendGrid - Email notifications


Features
->Idempotent Transaction Creation - Prevents duplicate charges
->Stripe Payment Integration - Create and manage PaymentIntents
->Background Reconciliation Worker - Automatic status synchronization
->Exponential Backoff Retry - Smart retry strategy for transient failures
->Email Notifications - Success, failure, and stuck transaction alerts
->Transaction History API - View all transactions with pagination
->Audit Trail - Every reconciliation attempt is logged
