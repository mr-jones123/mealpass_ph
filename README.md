# MealPass PH

Campus meal aid locked by a Soroban smart contract and paid to approved canteens in USDC.

## Problem

A scholarship student at University of San Carlos Cebu receives ₱500 weekly meal aid in cash, but the school cannot verify it was spent on meals, while nearby carinderias wait days to reconcile paper receipts.

## Solution

The school loads USDC into a Soroban meal allowance contract, the student scans a canteen QR, and the contract releases USDC only to approved food merchants with an auditable receipt.

## Timeline

- Day 1: Deploy contract to testnet, create school, student, and canteen identities.
- Day 2: Build the QR payment demo around `fund_student` and `pay_meal`.
- Day 3: Add a small dashboard for allowance, receipts, and merchant totals.
- Day 4: Polish the pitch with one live USDC testnet payment.

## Stellar Features Used

- USDC transfers through a Stellar Asset Contract compatible token.
- Soroban smart contracts for allowance rules, approved merchants, and receipts.
- Trustlines for real USDC accounts on Stellar testnet or mainnet.

## Vision and Purpose

MealPass PH helps schools and sponsors send restricted meal aid without forcing canteens into slow paper reconciliation. The goal is simple: students get lunch, canteens get fast settlement, and schools get transparent proof of spending.

## Prerequisites

- Rust stable with `wasm32v1-none` target.
- Soroban CLI or Stellar CLI version 27.x.
- Bun for the React wallet demo.
- Freighter browser extension switched to Testnet.
- A funded Stellar testnet identity.

```bash
rustup target add wasm32v1-none
soroban --version
bun --version
```

## Frontend Wallet Demo

```bash
bun install
bun dev
```

The SPA connects through StellarWalletsKit on Stellar Testnet, shows the connected public key,
loads the XLM balance from Horizon Testnet, sends signed Testnet XLM payments,
and calls the MealPass Soroban contract through Soroban RPC.

## Build

```bash
soroban contract build
bun run build
```

## Test

```bash
cargo test
bun run typecheck
```

## Deploy to Testnet

```bash
soroban contract deploy \
  --wasm target/wasm32v1-none/release/mealpass_ph.wasm \
  --source school \
  --network testnet
```

Save the returned contract ID:

```bash
CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## Sample CLI Invocation

Initialize the contract with the school admin and USDC token contract:

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source school \
  --network testnet \
  -- initialize \
  --admin GCSCHOOLADMINADDRESS000000000000000000000000000000000000 \
  --token CCUSDCTOKENCONTRACT000000000000000000000000000000000000
```

Approve a canteen:

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source school \
  --network testnet \
  -- set_merchant \
  --admin GCSCHOOLADMINADDRESS000000000000000000000000000000000000 \
  --merchant GCCANTEENADDRESS0000000000000000000000000000000000000 \
  --approved true
```

Fund a student allowance with 5 USDC using 7 decimal token units:

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source school \
  --network testnet \
  -- fund_student \
  --admin GCSCHOOLADMINADDRESS000000000000000000000000000000000000 \
  --student GCSTUDENTADDRESS000000000000000000000000000000000000 \
  --amount 50000000
```

MVP payment: student pays a canteen 1.50 USDC:

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source student \
  --network testnet \
  -- pay_meal \
  --student GCSTUDENTADDRESS000000000000000000000000000000000000 \
  --merchant GCCANTEENADDRESS0000000000000000000000000000000000000 \
  --amount 15000000
```

## Contract Details

<img width="1421" height="725" alt="image" src="https://github.com/user-attachments/assets/aa5fccf3-1484-4e91-bb76-9eff704b48b6" />

Current deployed contract ID: CBHODUN3XFZLWJFIXYUMAO4KKFBKJIKWMQFLLXQ55BXRWSUIA7A2W2UW

Level 2 event-enabled Wasm hash after build:

```text
6dfae6aed85405dccdfe4ba2e37242287287d9e3eafff171b2fc5806fe7e5833
```

Redeploy the event-enabled contract for Level 2, initialize it with the school
admin wallet, then paste the new contract ID into the frontend contract field.

## Level 2 Features

- StellarWalletsKit multi-wallet connection.
- Three visible error classes: wallet connection, balance/payment, and contract call errors.
- Contract read call: `receipt_count`.
- Contract write call: `set_merchant`.
- Transaction status tracking while the contract call is pending, submitted, and confirmed.
- Live contract event polling through Soroban RPC.

## License

MIT
