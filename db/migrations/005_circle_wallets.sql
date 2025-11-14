-- Add Circle wallet and transfer tracking to gifts
alter table gifts add column if not exists circle_wallet_id text;
alter table gifts add column if not exists circle_transfer_id text;
alter table gifts add column if not exists transfer_status text default 'pending';
alter table gifts add column if not exists sender_wallet_address text;

-- Transfer status values:
-- 'pending' - Gift created but escrow not yet funded
-- 'escrow_pending' - Escrow wallet created but funding in progress
-- 'escrow_funded' - Funds locked in escrow, ready to claim
-- 'transferring' - CCTP transfer in progress
-- 'completed' - Transfer completed successfully
-- 'failed' - Transfer failed

create index if not exists idx_gifts_circle_wallet on gifts(circle_wallet_id);
create index if not exists idx_gifts_transfer_status on gifts(transfer_status);
create index if not exists idx_gifts_sender_wallet on gifts(sender_wallet_address);

