# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Firebase-based pharmacy application with Cloud Functions for payment processing and exchange management. The system handles mobile money payments (MTN MoMo, Orange Money) and facilitates peer-to-peer pharmaceutical exchanges with escrow functionality.

## Commands

### Development
- `cd functions && npm run build` - Build TypeScript functions to `functions/lib/`
- `cd functions && npm run serve` - Start Firebase emulator for functions
- `cd functions && npm run deploy` - Deploy functions to Firebase

### Testing
- `pwsh ./scripts/test-cloudrun.ps1 -RunDemo` - Run full demo flow (topups, webhooks, exchanges)
- `pwsh ./scripts/test-cloudrun.ps1 -TestHealth` - Health check
- `pwsh ./scripts/test-cloudrun.ps1 -GetWallet pharmacy_A` - Check wallet balance

## Architecture

### Core Components

**Firebase Functions** (`functions/src/`)
- `index.ts` - Main HTTP endpoints (webhooks, payments, exchanges)
- `scheduled.ts` - Cron job to expire exchange holds after 6 hours
- `lib/idempotency.ts` - Idempotency key handling for webhooks
- `lib/exchange.ts` - Exchange cancellation logic

**Firestore Collections**
- `payments` - Payment intent records
- `webhook_logs` - Webhook call logs (TTL: 30 days)
- `wallets` - User wallet balances (available/held amounts)
- `ledger` - Transaction history
- `exchanges` - Exchange state (hold_active/completed/canceled)
- `idempotency` - Idempotency tracking

### Key Workflows

**Payment Flow**
1. Create payment intent via `topupIntent` endpoint
2. External webhook calls `momoWebhook` or `orangeWebhook`
3. Transaction updates payment status and credits wallet
4. All operations are idempotent using provider transaction IDs

**Exchange Flow**
1. `createExchangeHold` - Holds 50/50 split of courier fee from both parties
2. `exchangeCapture` - Releases holds and pays courier (incomplete implementation)
3. `exchangeCancel` - Returns held funds to participants
4. Scheduled job expires holds after 6 hours

### Security Model

- Webhook authentication via `MOMO_CALLBACK_TOKEN` and `ORANGE_CALLBACK_TOKEN` secrets
- Firestore rules restrict writes to functions only, reads to authenticated users/admins
- All transactions use Firebase transactions for ACID properties
- Idempotency prevents duplicate webhook processing

### Testing Infrastructure

PowerShell script (`scripts/test-cloudrun.ps1`) provides comprehensive testing:
- Simulates payment webhooks with proper authentication
- Tests exchange hold/capture/cancel flows
- Firestore wallet inspection utilities
- Cloud Run endpoint testing

## Development Notes

- Functions run on Node 20 with ES modules
- TypeScript compiled to `functions/lib/` directory
- All endpoints deployed to `europe-west1` region
- Scheduled functions use `Africa/Douala` timezone
- Exchange capture logic is incomplete (line 334 in index.ts)