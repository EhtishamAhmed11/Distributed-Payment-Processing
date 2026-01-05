CREATE EXTENSION IF NOT EXISTS pgcrypto;


CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    user_uuid UUID NOT NULL DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    phone VARCHAR(20),

    password_hash VARCHAR(255) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX ux_users_email ON users(email);
CREATE UNIQUE INDEX ux_users_uuid ON users(user_uuid);

CREATE TABLE transactions (
    transaction_id BIGSERIAL PRIMARY KEY,
    transaction_uuid UUID NOT NULL DEFAULT gen_random_uuid(),

    sender_user_id BIGINT NOT NULL,
    receiver_user_id BIGINT NOT NULL,

    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency CHAR(3) NOT NULL,

    description TEXT,

    status VARCHAR(20) NOT NULL CHECK (
        status IN (
            'created',
            'pending',
            'successful',
            'failed',
            'cancelled',
            'under_review',
            'stuck'
        )
    ),

    stripe_intent_id VARCHAR(100),
    stripe_payment_id VARCHAR(100),

    error_message TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tx_sender
        FOREIGN KEY (sender_user_id) REFERENCES users(user_id),

    CONSTRAINT fk_tx_receiver
        FOREIGN KEY (receiver_user_id) REFERENCES users(user_id),

    CONSTRAINT chk_sender_receiver_different
        CHECK (sender_user_id <> receiver_user_id)
);

CREATE UNIQUE INDEX ux_tx_uuid ON transactions(transaction_uuid);
CREATE UNIQUE INDEX ux_tx_stripe_intent ON transactions(stripe_intent_id);
CREATE UNIQUE INDEX ux_tx_stripe_payment ON transactions(stripe_payment_id);

CREATE INDEX idx_tx_sender ON transactions(sender_user_id);
CREATE INDEX idx_tx_receiver ON transactions(receiver_user_id);
CREATE INDEX idx_tx_status ON transactions(status);
CREATE INDEX idx_tx_created_at ON transactions(created_at);






CREATE TABLE reconciliation_attempts (
    id BIGSERIAL PRIMARY KEY,

    transaction_id BIGINT NOT NULL,

    stripe_status VARCHAR(50),
    our_status_before VARCHAR(20),
    our_status_after VARCHAR(20),

    error_message TEXT,

    checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_recon_tx
        FOREIGN KEY (transaction_id)
        REFERENCES transactions(transaction_id)
        ON DELETE CASCADE
);

CREATE INDEX idx_recon_tx ON reconciliation_attempts(transaction_id);
CREATE INDEX idx_recon_checked_at ON reconciliation_attempts(checked_at);

