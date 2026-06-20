import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";

let initialized = false;

export function initWalletKit() {
  if (initialized) return;
  StellarWalletsKit.init({ modules: defaultModules() });
  StellarWalletsKit.setNetwork(Networks.TESTNET);
  initialized = true;
}

export { StellarWalletsKit };
