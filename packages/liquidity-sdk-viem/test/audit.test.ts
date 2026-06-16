import {
  ChainId,
  getChainAddresses,
  type MarketId,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";
import { createMockClient, type MockClientHandle } from "@morpho-org/test/mock";
import nock from "nock";
import {
  toHex,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, test } from "vitest";
import { LiquidityLoader } from "../src/loader.js";

const loanToken = "0x0000000000000000000000000000000000000101";
const targetCollateralToken = "0x0000000000000000000000000000000000000202";
const targetMarketParams = new MarketParams({
  loanToken,
  collateralToken: targetCollateralToken,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 860000000000000000n,
});
const targetMarketId = targetMarketParams.id;

const setupLoaderMockClient = (blockTimestamp: bigint): MockClientHandle<typeof mainnet> => {
  const handle = createMockClient(mainnet);
  handle.request.mockImplementation(async ({ method, params }) => {
    if (method === "eth_chainId") return toHex(mainnet.id);
    if (method === "eth_getBlockByNumber") return {
        number: toHex(10n),
        timestamp: toHex(blockTimestamp),
        baseFeePerGas: "0x0",
        difficulty: "0x0",
        extraData: "0x",
        gasLimit: toHex(30_000_000n),
        gasUsed: "0x0",
        hash: "0x0000000000000000000000000000000000000000000000000000000000000001",
        logsBloom: "0x0",
        miner: zeroAddress,
        mixHash: "0x0",
        nonce: "0x0",
        parentHash: "0x0",
        receiptsRoot: "0x0",
        sha3Uncles: "0x0",
        size: "0x0",
        stateRoot: "0x0",
        totalDifficulty: "0x0",
        transactions: [],
        transactionsRoot: "0x0",
        uncles: []
    };
    if (method === "eth_call") {
        return `0x${"00".repeat(1024)}`;
    }
    return null;
  });
  return handle;
};

const mockApiMarkets = (vaultCount: number) => {
    const supplyingVaults = [];
    for (let i = 0; i < vaultCount; i++) {
        const addr = `0x${(i + 1).toString(16).padStart(40, "0")}`;
        supplyingVaults.push({
            address: addr,
            state: {
                allocation: [
                    {
                        market: {
                            uniqueKey: targetMarketId,
                            loanAsset: { address: loanToken },
                            targetWithdrawUtilization: "1000000000000000000"
                        }
                    }
                ]
            }
        });
    }

    return nock(new URL(BLUE_API_GRAPHQL_URL).origin)
    .post("/graphql")
    .reply(200, { data: { markets: { items: [
        {
            uniqueKey: targetMarketId,
            targetBorrowUtilization: "900000000000000000",
            publicAllocatorSharedLiquidity: [],
            supplyingVaults
        }
    ] } } });
}

describe("Security Audit: Targeted Verification", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  test("DoS Proof: Unbounded concurrency and high RPC call volume", async () => {
    const handle = setupLoaderMockClient(100n);
    const vaultCount = 10;
    mockApiMarkets(vaultCount);

    const loader = new LiquidityLoader(handle.client);
    try {
        await loader.fetch(targetMarketId);
    } catch (e) {
        // Errors expected due to dummy RPC data
    }

    const callCount = handle.request.mock.calls.length;
    console.log(`[AUDIT] RPC call count for ${vaultCount} vaults: ${callCount}`);

    // For 10 vaults, each with 1 allocation:
    // fetchMarket(targetMarketId) -> 1
    // fetchVault(vault) -> 10
    // for each vault:
    //   fetchPosition(vault, target) -> 10
    //   fetchVaultMarketConfig(vault, target) -> 10
    //     fetchVaultMarketPublicAllocatorConfig -> 10
    // Total approx: 1 + 10 + 10 + 10 + 10 = 41 calls
    // Plus getBlock -> 1

    expect(callCount).toBeGreaterThan(vaultCount * 3);
  });

  test("DataLoader Bug: Missing markets in API cause internal DataLoader error", async () => {
    const handle = setupLoaderMockClient(100n);
    // API returns empty list for requested market
    nock(new URL(BLUE_API_GRAPHQL_URL).origin)
    .post("/graphql")
    .reply(200, { data: { markets: { items: [] } } });

    const loader = new LiquidityLoader(handle.client);

    await expect(loader.fetch(targetMarketId)).rejects.toThrow(/did not return a Promise of an Array of the same length/);
  });
});
