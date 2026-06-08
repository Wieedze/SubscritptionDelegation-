import type { Account, Chain, Hex, PublicClient, Transport, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  Implementation,
  toMetaMaskSmartAccount,
  type MetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";

/**
 * Build the subscriber's Hybrid DeleGator smart account from an EOA private key.
 * The account is counterfactual until deployed; signing delegations does not
 * require deployment, but charging (redeeming) does.
 */
export async function createSubscriberSmartAccount(params: {
  client: PublicClient;
  ownerPrivateKey: Hex;
  /** Vary to derive multiple distinct smart accounts from one owner. */
  deploySalt?: Hex;
}): Promise<MetaMaskSmartAccount> {
  const owner: Account = privateKeyToAccount(params.ownerPrivateKey);
  return toMetaMaskSmartAccount({
    client: params.client,
    implementation: Implementation.Hybrid,
    deployParams: [owner.address, [], [], []],
    deploySalt: params.deploySalt ?? "0x",
    signer: { account: owner },
  });
}

/**
 * Build the subscriber's Hybrid DeleGator from a connected wallet (browser).
 * Signing a delegation triggers a wallet signature prompt — no private key here.
 */
export async function createSmartAccountFromWallet(params: {
  client: PublicClient;
  walletClient: WalletClient<Transport, Chain | undefined, Account>;
  deploySalt?: Hex;
}): Promise<MetaMaskSmartAccount> {
  const owner = params.walletClient.account.address;
  return toMetaMaskSmartAccount({
    client: params.client,
    implementation: Implementation.Hybrid,
    deployParams: [owner, [], [], []],
    deploySalt: params.deploySalt ?? "0x",
    signer: { walletClient: params.walletClient },
  });
}

/**
 * Deploy the smart account on-chain via a direct factory call (no bundler needed).
 * Returns the tx hash, or null if already deployed. The deployer EOA pays gas;
 * the smart account itself only needs to hold the ERC20 to be pulled.
 */
export async function deploySmartAccount(
  account: MetaMaskSmartAccount,
  deployer: WalletClient,
): Promise<Hex | null> {
  if (await account.isDeployed()) return null;
  const { factory, factoryData } = await account.getFactoryArgs();
  if (!factory || !factoryData) {
    throw new Error("Smart account exposes no factory args; cannot deploy.");
  }
  const deployerAccount = deployer.account;
  if (!deployerAccount) throw new Error("Deployer wallet client has no account.");
  return deployer.sendTransaction({
    account: deployerAccount,
    chain: deployer.chain,
    to: factory,
    data: factoryData,
  });
}
