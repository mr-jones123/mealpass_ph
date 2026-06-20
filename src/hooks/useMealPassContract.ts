import { useCallback, useEffect, useState } from "react";
import {
  approveMerchant,
  DEFAULT_MEALPASS_CONTRACT_ID,
  fetchMealPassEvents,
  type ContractStatus,
  type MealPassEvent,
  readReceiptCount,
} from "../lib/mealpassContract";

type SignWithWallet = (xdr: string) => Promise<{ signedTxXdr: string }>;

export function useMealPassContract(publicKey: string, signWithWallet: SignWithWallet) {
  const [contractId, setContractId] = useState(DEFAULT_MEALPASS_CONTRACT_ID);
  const [merchant, setMerchant] = useState("");
  const [receiptCount, setReceiptCount] = useState("Not loaded");
  const [events, setEvents] = useState<MealPassEvent[]>([]);
  const [status, setStatus] = useState<ContractStatus>("idle");
  const [statusText, setStatusText] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const readState = useCallback(async () => {
    setIsReading(true);
    setError("");
    try {
      setReceiptCount(await readReceiptCount(contractId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to read contract state.";
      setError(message);
    } finally {
      setIsReading(false);
    }
  }, [contractId]);

  const refreshEvents = useCallback(async () => {
    setIsListening(true);
    try {
      setEvents(await fetchMealPassEvents(contractId));
    } catch (err) {
      console.error("MealPass event fetch failed", err);
    } finally {
      setIsListening(false);
    }
  }, [contractId]);

  const approve = useCallback(async () => {
    if (!publicKey) {
      setError("Connect the school admin wallet before calling the contract.");
      return;
    }

    setStatus("pending");
    setStatusText("Waiting for wallet signature");
    setTxHash("");
    setError("");

    try {
      const result = await approveMerchant({
        contractId,
        admin: publicKey,
        merchant,
        approved: true,
        signWithWallet,
        onSubmitted: (hash) => {
          setTxHash(hash);
          setStatusText("Submitted to Soroban RPC");
        },
        onProgress: (nextStatus) => setStatusText(`RPC status: ${nextStatus}`),
      });

      setTxHash(result.txHash);
      setStatus("success");
      setStatusText("Merchant approval confirmed on Testnet");
      await readState();
      await refreshEvents();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Contract call failed.";
      setStatus("error");
      setStatusText("Contract call failed");
      setError(message);
      console.error("MealPass contract call failed", err);
    }
  }, [contractId, merchant, publicKey, readState, refreshEvents, signWithWallet]);

  useEffect(() => {
    void readState();
    void refreshEvents();
    const interval = window.setInterval(() => {
      void refreshEvents();
    }, 12_000);
    return () => window.clearInterval(interval);
  }, [readState, refreshEvents]);

  return {
    contractId,
    setContractId,
    merchant,
    setMerchant,
    receiptCount,
    events,
    status,
    statusText,
    txHash,
    error,
    isReading,
    isListening,
    readState,
    refreshEvents,
    approve,
  };
}
