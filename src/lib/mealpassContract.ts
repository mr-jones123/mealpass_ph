import { contract, Networks, rpc, scValToNative } from "@stellar/stellar-sdk";
import { isValidStellarPublicKey, STELLAR_NETWORK_PASSPHRASE } from "./stellar";

export const DEFAULT_MEALPASS_CONTRACT_ID =
  "CBHODUN3XFZLWJFIXYUMAO4KKFBKJIKWMQFLLXQ55BXRWSUIA7A2W2UW";
export const STELLAR_SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

const rpcServer = new rpc.Server(STELLAR_SOROBAN_RPC_URL);

type SignWithWallet = (xdr: string) => Promise<{ signedTxXdr: string }>;

export type ContractStatus = "idle" | "pending" | "success" | "error";

export type MealPassEvent = {
  id: string;
  type: string;
  ledger: number;
  txHash: string;
  payload: string;
};

function stringifyNative(value: unknown): string {
  return JSON.stringify(value, (_key, current) =>
    typeof current === "bigint" ? current.toString() : current,
  );
}

function assertContractId(contractId: string) {
  if (!contractId.trim().startsWith("C")) {
    throw new Error("Enter a Soroban contract address that starts with C.");
  }
}

async function getMealPassClient(contractId: string, publicKey?: string, signWithWallet?: SignWithWallet) {
  assertContractId(contractId);
  return contract.Client.from({
    contractId: contractId.trim(),
    networkPassphrase: Networks.TESTNET,
    publicKey,
    rpcUrl: STELLAR_SOROBAN_RPC_URL,
    signTransaction: signWithWallet
      ? async (xdr) => signWithWallet(xdr)
      : undefined,
  });
}

export async function readReceiptCount(contractId: string): Promise<string> {
  const client = await getMealPassClient(contractId);
  const tx = await (client as unknown as { receipt_count: () => Promise<{ result: bigint | number }> })
    .receipt_count();
  return tx.result.toString();
}

export async function approveMerchant(input: {
  contractId: string;
  admin: string;
  merchant: string;
  approved: boolean;
  signWithWallet: SignWithWallet;
  onSubmitted?: (hash: string) => void;
  onProgress?: (status: string) => void;
}): Promise<{ txHash: string }> {
  if (!isValidStellarPublicKey(input.admin)) throw new Error("Connect a valid admin wallet.");
  if (!isValidStellarPublicKey(input.merchant)) throw new Error("Enter a valid merchant public key.");

  const client = await getMealPassClient(input.contractId, input.admin, input.signWithWallet);
  const tx = await (client as unknown as {
    set_merchant: (
      args: { admin: string; merchant: string; approved: boolean },
    ) => Promise<{
      signAndSend: (opts: {
        force?: boolean;
        watcher?: {
          onSubmitted?: (response?: { hash?: string }) => void;
          onProgress?: (response?: { status?: string }) => void;
        };
      }) => Promise<{
        sendTransactionResponse?: { hash?: string };
        getTransactionResponse?: { txHash?: string };
      }>;
    }>;
  }).set_merchant({
    admin: input.admin,
    merchant: input.merchant,
    approved: input.approved,
  });

  const sent = await tx.signAndSend({
    force: true,
    watcher: {
      onSubmitted: (response) => {
        if (response?.hash) input.onSubmitted?.(response.hash);
      },
      onProgress: (response) => {
        if (response?.status) input.onProgress?.(response.status);
      },
    },
  });

  return {
    txHash: sent.getTransactionResponse?.txHash || sent.sendTransactionResponse?.hash || "",
  };
}

export async function fetchMealPassEvents(contractId: string): Promise<MealPassEvent[]> {
  assertContractId(contractId);
  const latest = await rpcServer.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - 8_000);
  const response = await rpcServer.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [contractId.trim()] }],
    limit: 12,
  });

  return response.events.map((event) => {
    const topics = event.topic.map((topic) => scValToNative(topic).toString());
    return {
      id: event.id,
      type: topics.join(" / ") || event.type,
      ledger: event.ledger,
      txHash: event.txHash,
      payload: stringifyNative(scValToNative(event.value)),
    };
  }).reverse();
}

export function ensureTestnetPassphrase(passphrase: string) {
  if (passphrase !== STELLAR_NETWORK_PASSPHRASE) {
    throw new Error("Only Stellar Testnet is allowed for MealPass Level 2.");
  }
}
