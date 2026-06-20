import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAddress,
  getNetworkDetails,
  isConnected as isFreighterConnected,
  setAllowed,
  signTransaction,
} from "@stellar/freighter-api";
import { Networks } from "@stellar/stellar-sdk";
import {
  buildXlmPaymentTransaction,
  ensureDestinationExists,
  fetchXlmBalance,
  isValidStellarPublicKey,
  STELLAR_NETWORK,
  STELLAR_NETWORK_PASSPHRASE,
  submitSignedTransaction,
  toFriendlyHorizonError,
  validateXlmAmount,
} from "../lib/stellar";

const STORAGE_KEY = "mealpass.freighterPublicKey";

type TxStatus = "idle" | "pending" | "success" | "error";

type SendPaymentArgs = {
  destination: string;
  amount: string;
  memo?: string;
};

export type StellarWalletState = {
  publicKey: string;
  isConnected: boolean;
  balance: string;
  spendableBalance: number;
  reserveBalance: number;
  isConnecting: boolean;
  isLoadingBalance: boolean;
  isSending: boolean;
  error: string;
  txHash: string;
  txStatus: TxStatus;
};

function getApiErrorMessage(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const error = (result as { error?: { message?: string } | string }).error;
  if (!error) return null;
  return typeof error === "string" ? error : error.message || "Freighter returned an error.";
}

function extractAddress(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const value = result as { address?: string; publicKey?: string };
  return value.address || value.publicKey || "";
}

function extractBoolean(result: unknown, key: string): boolean {
  if (typeof result === "boolean") return result;
  if (!result || typeof result !== "object") return false;
  return Boolean((result as Record<string, unknown>)[key]);
}

function extractSignedXdr(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const value = result as { signedTxXdr?: string; signedTransaction?: string };
  return value.signedTxXdr || value.signedTransaction || "";
}

function isWrongNetwork(networkDetails: unknown): boolean {
  if (!networkDetails || typeof networkDetails !== "object") return false;
  const details = networkDetails as {
    network?: string;
    networkPassphrase?: string;
    error?: { message?: string } | string;
  };

  if (details.error) return false;
  if (details.networkPassphrase) {
    return details.networkPassphrase !== STELLAR_NETWORK_PASSPHRASE;
  }
  if (details.network) {
    return details.network.toUpperCase() !== STELLAR_NETWORK;
  }
  return false;
}

function useStoredPublicKey(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) || "";
}

export function useStellarWallet() {
  const [publicKey, setPublicKey] = useState("");
  const [balance, setBalance] = useState("");
  const [spendableBalance, setSpendableBalance] = useState(0);
  const [reserveBalance, setReserveBalance] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");

  const refreshBalance = useCallback(async (walletKey = publicKey) => {
    if (!walletKey) return;

    setIsLoadingBalance(true);
    setError("");

    try {
      const result = await fetchXlmBalance(walletKey);
      setBalance(result.balance);
      setSpendableBalance(result.spendable);
      setReserveBalance(result.reserve);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load XLM balance.";
      setBalance("");
      setSpendableBalance(0);
      setError(message);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [publicKey]);

  const disconnect = useCallback(() => {
    setPublicKey("");
    setBalance("");
    setSpendableBalance(0);
    setReserveBalance(0);
    setError("");
    setTxHash("");
    setTxStatus("idle");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError("");
    setTxHash("");
    setTxStatus("idle");

    try {
      const connectionResult = await isFreighterConnected();
      const connectionError = getApiErrorMessage(connectionResult);
      if (connectionError) throw new Error(connectionError);

      if (!extractBoolean(connectionResult, "isConnected")) {
        throw new Error(
          "Freighter wallet is required. Install the Freighter browser extension and switch to Testnet.",
        );
      }

      const allowedResult = await setAllowed();
      const allowedError = getApiErrorMessage(allowedResult);
      if (allowedError) throw new Error(allowedError);
      if (!extractBoolean(allowedResult, "isAllowed")) {
        throw new Error("Freighter connection was not approved.");
      }

      const addressResult = await getAddress();
      const addressError = getApiErrorMessage(addressResult);
      if (addressError) throw new Error(addressError);

      const nextPublicKey = extractAddress(addressResult);
      if (!isValidStellarPublicKey(nextPublicKey)) {
        throw new Error("Freighter did not return a valid Stellar public key.");
      }

      const networkDetails = await getNetworkDetails();
      const networkError = getApiErrorMessage(networkDetails);
      if (networkError) throw new Error(networkError);
      if (isWrongNetwork(networkDetails)) {
        throw new Error("Freighter is not on Testnet. Switch Freighter to Testnet and reconnect.");
      }

      setPublicKey(nextPublicKey);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, nextPublicKey);
      }
      await refreshBalance(nextPublicKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to connect Freighter.";
      setError(message);
      console.error("Freighter connect failed", err);
    } finally {
      setIsConnecting(false);
    }
  }, [refreshBalance]);

  const sendXlm = useCallback(async ({ destination, amount, memo }: SendPaymentArgs) => {
    if (!publicKey) {
      setError("Connect Freighter before sending XLM.");
      return;
    }

    const cleanDestination = destination.trim();
    const cleanAmount = amount.trim();
    const cleanMemo = memo?.trim();

    setIsSending(true);
    setError("");
    setTxHash("");
    setTxStatus("pending");

    try {
      const networkDetails = await getNetworkDetails();
      if (isWrongNetwork(networkDetails)) {
        throw new Error("Freighter is not on Testnet. Switch Freighter to Testnet before signing.");
      }

      if (!isValidStellarPublicKey(cleanDestination)) {
        throw new Error("Enter a valid Stellar destination public key.");
      }
      if (cleanDestination === publicKey) {
        throw new Error("Destination must be a different Testnet account.");
      }

      const amountError = validateXlmAmount(cleanAmount);
      if (amountError) throw new Error(amountError);

      const balanceResult = await fetchXlmBalance(publicKey);
      if (Number(cleanAmount) > balanceResult.spendable) {
        throw new Error(
          `Insufficient spendable XLM. You can send up to ${balanceResult.spendable.toFixed(7)} XLM after reserve and fees.`,
        );
      }

      await ensureDestinationExists(cleanDestination);
      const transaction = await buildXlmPaymentTransaction({
        sourcePublicKey: publicKey,
        destination: cleanDestination,
        amount: cleanAmount,
        memo: cleanMemo,
      });

      const signedResult = await signTransaction(transaction.toXDR(), {
        networkPassphrase: Networks.TESTNET,
        address: publicKey,
      });
      const signingError = getApiErrorMessage(signedResult);
      if (signingError) throw new Error(signingError);

      const signedTxXdr = extractSignedXdr(signedResult);
      if (!signedTxXdr) {
        throw new Error("Freighter did not return a signed transaction.");
      }

      const response = await submitSignedTransaction(signedTxXdr);
      setTxHash(response.hash);
      setTxStatus("success");
      await refreshBalance(publicKey);
    } catch (err) {
      const message = toFriendlyHorizonError(
        err,
        "Unable to send this Testnet payment.",
      );
      setTxStatus("error");
      setError(message);
      console.error("XLM payment failed", err);
    } finally {
      setIsSending(false);
    }
  }, [publicKey, refreshBalance]);

  useEffect(() => {
    const stored = useStoredPublicKey();
    if (stored && isValidStellarPublicKey(stored)) {
      setPublicKey(stored);
      void refreshBalance(stored);
    }
  }, [refreshBalance]);

  return useMemo<StellarWalletState & {
    connect: () => Promise<void>;
    disconnect: () => void;
    refreshBalance: () => Promise<void>;
    sendXlm: (args: SendPaymentArgs) => Promise<void>;
  }>(() => ({
    publicKey,
    isConnected: Boolean(publicKey),
    balance,
    spendableBalance,
    reserveBalance,
    isConnecting,
    isLoadingBalance,
    isSending,
    error,
    txHash,
    txStatus,
    connect,
    disconnect,
    refreshBalance: () => refreshBalance(publicKey),
    sendXlm,
  }), [
    publicKey,
    balance,
    spendableBalance,
    reserveBalance,
    isConnecting,
    isLoadingBalance,
    isSending,
    error,
    txHash,
    txStatus,
    connect,
    disconnect,
    refreshBalance,
    sendXlm,
  ]);
}
