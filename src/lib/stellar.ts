import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

export const STELLAR_NETWORK = "TESTNET";
export const STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
export const STELLAR_EXPERT_TESTNET_TX_URL =
  "https://stellar.expert/explorer/testnet/tx";

const XLM_DECIMALS = 7;
const BASE_RESERVE_XLM = 0.5;
export const horizonServer = new Horizon.Server(STELLAR_HORIZON_URL);

export type BalanceResult = {
  balance: string;
  spendable: number;
  reserve: number;
};

export type SendXlmInput = {
  sourcePublicKey: string;
  destination: string;
  amount: string;
  memo?: string;
};

export function isValidStellarPublicKey(value: string): boolean {
  try {
    return StrKey.isValidEd25519PublicKey(value.trim());
  } catch {
    return false;
  }
}

export function truncatePublicKey(publicKey: string): string {
  if (publicKey.length <= 16) return publicKey;
  return `${publicKey.slice(0, 8)}...${publicKey.slice(-8)}`;
}

export function validateXlmAmount(amount: string): string | null {
  const cleanAmount = amount.trim();

  if (!cleanAmount) return "Enter an XLM amount.";
  if (cleanAmount.startsWith("-") || cleanAmount.startsWith("+")) {
    return "Amount must be greater than 0.";
  }
  if (/e/i.test(cleanAmount)) return "Use a normal decimal amount, not scientific notation.";
  if (!/^\d+(\.\d+)?$/.test(cleanAmount)) return "Amount must be a valid number.";

  const [, decimals = ""] = cleanAmount.split(".");
  if (decimals.length > XLM_DECIMALS) {
    return "XLM supports up to 7 decimal places.";
  }

  const numericAmount = Number(cleanAmount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return "Amount must be greater than 0.";
  }

  return null;
}

export async function fetchXlmBalance(publicKey: string): Promise<BalanceResult> {
  try {
    const account = await horizonServer.loadAccount(publicKey);
    const nativeBalance = account.balances.find(
      (balance) => balance.asset_type === "native",
    );

    if (!nativeBalance) {
      return { balance: "0", spendable: 0, reserve: BASE_RESERVE_XLM * 2 };
    }

    const balance = nativeBalance.balance;
    const subentries = Number(account.subentry_count ?? 0);
    const reserve = (2 + Math.max(0, subentries)) * BASE_RESERVE_XLM;
    const fee = Number(BASE_FEE) / 10 ** XLM_DECIMALS;
    const spendable = Math.max(0, Number(balance) - reserve - fee);

    return { balance, spendable, reserve };
  } catch (error) {
    throw new Error(toFriendlyHorizonError(error, "Unable to fetch Testnet balance."));
  }
}

export async function ensureDestinationExists(destination: string): Promise<void> {
  try {
    await horizonServer.loadAccount(destination);
  } catch (error) {
    const maybeError = error as { response?: { status?: number } };
    if (maybeError?.response?.status === 404) {
      throw new Error(
        "Destination account was not found on Testnet. Fund it with Friendbot first.",
      );
    }
    throw new Error(toFriendlyHorizonError(error, "Unable to check destination account."));
  }
}

export async function buildXlmPaymentTransaction({
  sourcePublicKey,
  destination,
  amount,
  memo,
}: SendXlmInput) {
  const sourceAccount = await horizonServer.loadAccount(sourcePublicKey);
  const builder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  }).addOperation(
    Operation.payment({
      destination,
      asset: Asset.native(),
      amount,
    }),
  );

  const cleanMemo = memo?.trim();
  if (cleanMemo) {
    builder.addMemo(Memo.text(cleanMemo.slice(0, 28)));
  }

  return builder.setTimeout(180).build();
}

export async function submitSignedTransaction(signedTxXdr: string) {
  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
  return horizonServer.submitTransaction(signedTx);
}

export function toFriendlyHorizonError(error: unknown, fallback: string): string {
  const maybeError = error as {
    message?: string;
    response?: { status?: number; data?: { extras?: { result_codes?: unknown } } };
  };

  if (maybeError?.response?.status === 404) {
    return "Your Testnet account is not funded yet. Fund it using Stellar Friendbot, then refresh balance.";
  }

  const resultCodes = maybeError?.response?.data?.extras?.result_codes;
  if (resultCodes) {
    console.error("Stellar transaction result codes", resultCodes);
    return "The Stellar Testnet rejected this transaction. Check the destination, amount, and account funding.";
  }

  if (maybeError?.message?.toLowerCase().includes("network")) {
    return "Could not reach Stellar Testnet. Check your connection and try again.";
  }

  return maybeError?.message || fallback;
}
