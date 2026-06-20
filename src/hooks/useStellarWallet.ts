import { useCallback, useEffect, useMemo, useState } from "react";
import { Networks } from "@stellar/stellar-sdk";
import { KitEventType, type ISupportedWallet } from "@creit.tech/stellar-wallets-kit/types";
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
import { initWalletKit, StellarWalletsKit } from "../lib/walletKit";

const STORAGE_KEY = "mealpass.walletPublicKey";

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
  supportedWallets: ISupportedWallet[];
  selectedWalletId: string;
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
  return typeof error === "string" ? error : error.message || "Wallet returned an error.";
}

function extractSignedXdr(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  return (result as { signedTxXdr?: string; signedTransaction?: string }).signedTxXdr ||
    (result as { signedTransaction?: string }).signedTransaction ||
    "";
}

function isWrongNetwork(networkDetails: unknown): boolean {
  if (!networkDetails || typeof networkDetails !== "object") return false;
  const details = networkDetails as {
    network?: string;
    networkPassphrase?: string;
    error?: { message?: string } | string;
  };

  if (details.error) return false;
  if (details.networkPassphrase) return details.networkPassphrase !== STELLAR_NETWORK_PASSPHRASE;
  if (details.network) return details.network.toUpperCase() !== STELLAR_NETWORK;
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
  const [supportedWallets, setSupportedWallets] = useState<ISupportedWallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState("");
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
    void StellarWalletsKit.disconnect().catch(() => undefined);
    setPublicKey("");
    setBalance("");
    setSpendableBalance(0);
    setReserveBalance(0);
    setError("");
    setTxHash("");
    setTxStatus("idle");
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError("");
    setTxHash("");
    setTxStatus("idle");

    try {
      initWalletKit();
      const { address } = await StellarWalletsKit.authModal();

      if (!isValidStellarPublicKey(address)) {
        throw new Error("Selected wallet did not return a valid Stellar public key.");
      }

      const networkDetails = await StellarWalletsKit.getNetwork();
      if (isWrongNetwork(networkDetails)) {
        throw new Error("Selected wallet is not on Testnet. Switch to Testnet and reconnect.");
      }

      setPublicKey(address);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, address);
      await refreshBalance(address);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to connect a Stellar wallet.";
      setError(message);
      console.error("Wallet connect failed", err);
    } finally {
      setIsConnecting(false);
    }
  }, [refreshBalance]);

  const signWithWallet = useCallback(async (xdr: string) => {
    const signedResult = await StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase: Networks.TESTNET,
      address: publicKey,
    });
    const signingError = getApiErrorMessage(signedResult);
    if (signingError) throw new Error(signingError);

    const signedTxXdr = extractSignedXdr(signedResult);
    if (!signedTxXdr) throw new Error("Wallet did not return a signed transaction.");
    return { signedTxXdr };
  }, [publicKey]);

  const sendXlm = useCallback(async ({ destination, amount, memo }: SendPaymentArgs) => {
    if (!publicKey) {
      setError("Connect a Stellar wallet before sending XLM.");
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
      const networkDetails = await StellarWalletsKit.getNetwork();
      if (isWrongNetwork(networkDetails)) {
        throw new Error("Selected wallet is not on Testnet. Switch to Testnet before signing.");
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

      const { signedTxXdr } = await signWithWallet(transaction.toXDR());
      const response = await submitSignedTransaction(signedTxXdr);
      setTxHash(response.hash);
      setTxStatus("success");
      await refreshBalance(publicKey);
    } catch (err) {
      const message = toFriendlyHorizonError(err, "Unable to send this Testnet payment.");
      setTxStatus("error");
      setError(message);
      console.error("XLM payment failed", err);
    } finally {
      setIsSending(false);
    }
  }, [publicKey, refreshBalance, signWithWallet]);

  useEffect(() => {
    initWalletKit();
    void StellarWalletsKit.refreshSupportedWallets().then(setSupportedWallets).catch(() => undefined);

    const stopState = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
      const address = event.payload.address || "";
      if (address && isValidStellarPublicKey(address)) {
        setPublicKey(address);
        if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, address);
        void refreshBalance(address);
      }
    });
    const stopWallet = StellarWalletsKit.on(KitEventType.WALLET_SELECTED, (event) => {
      setSelectedWalletId(event.payload.id || "");
    });
    const stopDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, disconnect);

    const stored = useStoredPublicKey();
    if (stored && isValidStellarPublicKey(stored)) {
      setPublicKey(stored);
      void refreshBalance(stored);
    }

    return () => {
      stopState();
      stopWallet();
      stopDisconnect();
    };
  }, [disconnect, refreshBalance]);

  return useMemo<StellarWalletState & {
    connect: () => Promise<void>;
    disconnect: () => void;
    refreshBalance: () => Promise<void>;
    sendXlm: (args: SendPaymentArgs) => Promise<void>;
    signWithWallet: (xdr: string) => Promise<{ signedTxXdr: string }>;
  }>(() => ({
    publicKey,
    isConnected: Boolean(publicKey),
    balance,
    spendableBalance,
    reserveBalance,
    supportedWallets,
    selectedWalletId,
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
    signWithWallet,
  }), [
    publicKey,
    balance,
    spendableBalance,
    reserveBalance,
    supportedWallets,
    selectedWalletId,
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
    signWithWallet,
  ]);
}
