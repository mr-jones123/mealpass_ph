import { useMemo, useState } from "react";
import { useStellarWallet } from "../hooks/useStellarWallet";
import { useMealPassContract } from "../hooks/useMealPassContract";
import {
  STELLAR_EXPERT_TESTNET_TX_URL,
  truncatePublicKey,
  validateXlmAmount,
} from "../lib/stellar";

function formatXlm(value: string): string {
  if (!value) return "Not loaded";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

function copyText(value: string) {
  if (!navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}

function WalletGlyph() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className="wallet-glyph">
      <path
        d="M25 36c0-7 6-12 13-12h49c7 0 13 5 13 12v48c0 7-6 12-13 12H38c-7 0-13-5-13-12V36Z"
        fill="#f8f4ec"
      />
      <path
        d="M31 43h61c8 0 14 6 14 14v28c0 7-6 13-14 13H31c-8 0-14-6-14-13V57c0-8 6-14 14-14Z"
        fill="#8faa55"
      />
      <path
        d="M70 60h33v23H70c-7 0-12-5-12-11s5-12 12-12Z"
        fill="#fff7e3"
      />
      <circle cx="73" cy="72" r="5" fill="#2f79b8" />
      <path
        d="M31 43h61c8 0 14 6 14 14v28c0 7-6 13-14 13H31c-8 0-14-6-14-13V57c0-8 6-14 14-14Z"
        fill="none"
        stroke="#263238"
        strokeOpacity="0.2"
        strokeWidth="4"
      />
    </svg>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <div className={connected ? "status-pill is-live" : "status-pill"}>
      <span className="status-dot" />
      {connected ? "Wallet connected" : "Testnet wallet required"}
    </div>
  );
}

export function StellarWalletPanel() {
  const wallet = useStellarWallet();
  const mealPass = useMealPassContract(wallet.publicKey, wallet.signWithWallet);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [copied, setCopied] = useState(false);

  const formError = useMemo(() => {
    if (!amount) return "";
    return validateXlmAmount(amount) || "";
  }, [amount]);

  const txLink = wallet.txHash
    ? `${STELLAR_EXPERT_TESTNET_TX_URL}/${wallet.txHash}`
    : "";

  function handleCopy() {
    if (!wallet.publicKey) return;
    copyText(wallet.publicKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    await wallet.sendXlm({ destination, amount, memo });
  }

  async function handleContractSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    await mealPass.approve();
  }

  return (
    <section className="wallet-shell" aria-label="Stellar Testnet wallet">
      <div className="hero-copy">
        <div className="school-badge">MealPass PH Level 2</div>
        <h1>Campus meal aid, paid on Stellar Testnet.</h1>
        <p>
          Connect with StellarWalletsKit, check your XLM balance, approve a
          canteen on the MealPass contract, and watch contract events sync from
          Soroban RPC.
        </p>
      </div>

      <div className="wallet-grid">
        <article className="clay-card wallet-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Wallet session</p>
              <h2>Wallet setup</h2>
            </div>
            <StatusPill connected={wallet.isConnected} />
          </div>

          <div className="wallet-visual">
            <WalletGlyph />
            <div>
              <p className="mini-label">Network</p>
              <strong>Stellar Testnet only</strong>
              <span>Never Mainnet for this demo.</span>
            </div>
          </div>

          {!wallet.isConnected ? (
            <button
              className="primary-button"
              type="button"
              onClick={wallet.connect}
              disabled={wallet.isConnecting}
            >
              {wallet.isConnecting ? "Opening wallet kit" : "Choose Stellar Wallet"}
            </button>
          ) : (
            <div className="connected-box">
              <p className="mini-label">Connected public key</p>
              <div className="address-row">
                <code>{truncatePublicKey(wallet.publicKey)}</code>
                <button type="button" className="ghost-button" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button className="secondary-button" type="button" onClick={wallet.disconnect}>
                Disconnect
              </button>
              {wallet.selectedWalletId ? (
                <small>Selected wallet: {wallet.selectedWalletId}</small>
              ) : null}
            </div>
          )}

          <div className="wallet-options">
            <p className="mini-label">Wallet options</p>
            <div>
              {wallet.supportedWallets.slice(0, 6).map((option) => (
                <span key={option.id} className={option.isAvailable ? "wallet-option is-ready" : "wallet-option"}>
                  {option.name}
                </span>
              ))}
            </div>
          </div>

          <p className="helper-copy">
            WalletsKit handles Freighter, xBull, Albedo, Lobstr, and other
            Stellar wallets. Use Testnet only.
          </p>
        </article>

        <article className="clay-card balance-card">
          <div className="card-heading compact">
            <div>
              <p className="eyebrow">Balance</p>
              <h2>XLM available</h2>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={wallet.refreshBalance}
              disabled={!wallet.isConnected || wallet.isLoadingBalance}
            >
              {wallet.isLoadingBalance ? "Refreshing" : "Refresh"}
            </button>
          </div>

          <div className={wallet.isLoadingBalance ? "balance-number loading" : "balance-number"}>
            <strong>{wallet.isLoadingBalance ? "Loading" : formatXlm(wallet.balance)}</strong>
            <span>XLM</span>
          </div>

          <dl className="balance-meta">
            <div>
              <dt>Spendable estimate</dt>
              <dd>{wallet.spendableBalance.toFixed(7)} XLM</dd>
            </div>
            <div>
              <dt>Reserve held</dt>
              <dd>{wallet.reserveBalance.toFixed(2)} XLM</dd>
            </div>
          </dl>

          {!wallet.balance && !wallet.isLoadingBalance ? (
            <p className="empty-note">
              No balance loaded yet. Connect a funded Testnet account or fund it
              with Friendbot, then refresh.
            </p>
          ) : null}
        </article>

        <form className="clay-card send-card" onSubmit={handleSubmit}>
          <div className="card-heading">
            <div>
              <p className="eyebrow">Send XLM</p>
              <h2>Test a meal payment rail</h2>
            </div>
            <span className="meal-chip">Lunch demo</span>
          </div>

          <label className="field-block">
            <span>Destination public key</span>
            <input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="G..."
              autoComplete="off"
            />
            <small>Use another funded Stellar Testnet account.</small>
          </label>

          <div className="field-row">
            <label className="field-block">
              <span>Amount in XLM</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="1.25"
                inputMode="decimal"
              />
              <small>{formError || "Up to 7 decimal places."}</small>
            </label>
            <label className="field-block">
              <span>Memo optional</span>
              <input
                value={memo}
                onChange={(event) => setMemo(event.target.value.slice(0, 28))}
                placeholder="Meal allowance"
                maxLength={28}
              />
              <small>{28 - memo.length} characters left.</small>
            </label>
          </div>

          <button
            className="primary-button wide"
            type="submit"
            disabled={!wallet.isConnected || wallet.isSending || Boolean(formError)}
          >
            {wallet.isSending ? "Waiting for signature" : "Send Testnet XLM"}
          </button>
        </form>
      </div>

      <section className="contract-grid" aria-label="MealPass contract console">
        <form className="clay-card contract-card" onSubmit={handleContractSubmit}>
          <div className="card-heading">
            <div>
              <p className="eyebrow">Smart contract</p>
              <h2>Approve a canteen</h2>
            </div>
            <span className="meal-chip">Soroban RPC</span>
          </div>

          <label className="field-block">
            <span>MealPass contract address</span>
            <input
              value={mealPass.contractId}
              onChange={(event) => mealPass.setContractId(event.target.value)}
              placeholder="C..."
              autoComplete="off"
            />
            <small>Redeploy after contract event changes, then paste the new C address.</small>
          </label>

          <label className="field-block">
            <span>Canteen merchant public key</span>
            <input
              value={mealPass.merchant}
              onChange={(event) => mealPass.setMerchant(event.target.value)}
              placeholder="G..."
              autoComplete="off"
            />
            <small>The connected wallet must be the school admin stored in the contract.</small>
          </label>

          <div className="contract-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={!wallet.isConnected || mealPass.status === "pending"}
            >
              {mealPass.status === "pending" ? "Calling contract" : "Approve merchant"}
            </button>
            <button className="ghost-button" type="button" onClick={mealPass.readState}>
              {mealPass.isReading ? "Reading" : "Read receipt count"}
            </button>
          </div>

          <dl className="contract-meta">
            <div>
              <dt>Receipt count</dt>
              <dd>{mealPass.receiptCount}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{mealPass.statusText || mealPass.status}</dd>
            </div>
          </dl>
        </form>

        <article className="clay-card events-card">
          <div className="card-heading compact">
            <div>
              <p className="eyebrow">Live events</p>
              <h2>Contract feed</h2>
            </div>
            <button type="button" className="ghost-button" onClick={mealPass.refreshEvents}>
              {mealPass.isListening ? "Syncing" : "Sync"}
            </button>
          </div>

          {mealPass.events.length ? (
            <ol className="event-list">
              {mealPass.events.map((event) => (
                <li key={event.id}>
                  <strong>{event.type}</strong>
                  <span>Ledger {event.ledger}</span>
                  <code>{truncatePublicKey(event.txHash)}</code>
                  <small>{event.payload}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-note">
              No contract events found yet. Approve a merchant after redeploying
              the event-enabled contract.
            </p>
          )}
        </article>
      </section>

      <div className="feedback-strip" aria-live="polite">
        {wallet.error ? <p className="error-text">{wallet.error}</p> : null}
        {wallet.txStatus === "pending" ? (
          <p className="pending-text">Transaction pending. Confirm it in Freighter.</p>
        ) : null}
        {wallet.txStatus === "success" && wallet.txHash ? (
          <p className="success-text">
            Transaction sent. Hash: <code>{truncatePublicKey(wallet.txHash)}</code>{" "}
            <a href={txLink} target="_blank" rel="noreferrer">
              View on Stellar Expert
            </a>
          </p>
        ) : null}
        {mealPass.error ? <p className="error-text">{mealPass.error}</p> : null}
        {mealPass.txHash ? (
          <p className="success-text">
            Contract call hash: <code>{truncatePublicKey(mealPass.txHash)}</code>{" "}
            <a
              href={`${STELLAR_EXPERT_TESTNET_TX_URL}/${mealPass.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View contract transaction
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}
