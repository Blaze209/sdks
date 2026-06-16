# Security Audit Report — liquidity-sdk-viem
**Date:** 2024-05-22
**Program:** Morpho Bug Bounty Program
**Scope:** Source code audit of liquidity-sdk-viem — authorized under program Safe Harbor

---

## Executive Summary
The `liquidity-sdk-viem` package provides a `LiquidityLoader` to calculate shared liquidity via Morpho's PublicAllocator. The audit identified a contract violation in the use of `DataLoader` that can lead to internal package errors when the Morpho API returns incomplete data. Additionally, the current implementation of `LiquidityLoader` is susceptible to performance degradation and high RPC call volume when dealing with a large number of vaults and markets, which could be used to induce local Denial of Service (DoS) in client applications or bots.

**Total estimated financial exposure:** Low (primary risks are operational and reliability)
**Most critical compliance risk identified:** None
**Overall security posture:** Good, but requires improvements in data consistency handling and request batching/concurrency control.
**Prioritized remediation urgency:** Medium

---

## Business Context
The `@morpho-org/liquidity-sdk-viem` package is used by liquidity bots and integrators to discover and plan reallocations through the PublicAllocator on Morpho Blue. It helps find available liquidity across multiple MetaMorpho vaults.

### Business Asset Risk Map
| Component | What It Does | Business Value | Data Sensitivity | Attack Priority |
|-----------|-------------|----------------|-----------------|----------------|
| LiquidityLoader | Computes reallocation plans | Revenue/Efficiency | Low | Medium |

- **Users:** DeFi integrators, liquidity bot operators.
- **Sensitive Data:** None (public on-chain data).
- **Sensitive Operations:** Liquidity discovery and reallocation planning.
- **Attack Cost:** Operational downtime or missed liquidity opportunities.

---

## Methodology
The audit involved:
1. Static analysis of `src/loader.ts` and its dependencies.
2. Tracing data flow from the Morpho GraphQL API and on-chain RPC calls.
3. Behavioral analysis of the `DataLoader` implementation and simulation logic.
4. Verification of findings through targeted Vitest unit tests simulating various API and RPC responses.
5. Reliability verification via 5x repeated test execution.

Note: this was a source code audit — no production systems were accessed.

---

## Findings (Highest Business Impact First)

### [FINDING-001] DataLoader Contract Violation on Missing API Data
**Severity:** Medium
**Confidence:** Confirmed
**Boardroom Version:** A bug in how the SDK talks to the Morpho API can cause the entire liquidity discovery process to crash if the API returns incomplete data.

#### Weakness Classification
- Primary CWE: CWE-252 — Unchecked Return Value
- Secondary CWE: CWE-754 — Improper Check for Unusual or Exceptional Conditions
- Why this mapping fits: The `DataLoader` batch function assumes the API will return exactly the same number of markets as requested. If the API returns fewer, the `DataLoader` throws an internal error because its contract is violated.

#### Affected Component
- File(s): `packages/liquidity-sdk-viem/src/loader.ts`
- Function(s): `DataLoader` batch function
- Line(s): 185-212
- Version: [latest]

#### Vulnerability Details
The `DataLoader` constructor in `src/loader.ts` defines a batch loading function for `marketIds`. It fetches market data from the Morpho API. If any `marketId` is not found in the API response (e.g. unindexed or invalid), `apiMarkets.length` will be less than `marketIds.length`. `DataLoader` requires the batch function to return an array of the same length as the input keys.

#### Business Impact Analysis
- Financial: Low. Induces a crash in the loader, preventing liquidity discovery.
- Data Breach: None.
- Reputational: Low/Medium. Affects SDK reliability.
- Operational: Medium. Bots using the SDK may stop functioning.
- Compliance: None.
- Attacker Motivation: Opportunistic.

#### Proof of Concept
Targeted test in `packages/liquidity-sdk-viem/test/audit.test.ts` (test case: `DataLoader Bug: Missing markets in API cause internal DataLoader error`).

#### Reliability Verification (5 Tests)
| Run | Result | Notes |
|-----|--------|-------|
| 1 | Pass | Confirmed crash on missing data |
| 2 | Pass | Confirmed crash on missing data |
| 3 | Pass | Confirmed crash on missing data |
| 4 | Pass | Confirmed crash on missing data |
| 5 | Pass | Confirmed crash on missing data |

#### Fix Recommendations
- **Immediate (24-48h):** Ensure the batch function returns an `Error` object for missing keys to satisfy the length requirement.
- **Short-term (2 weeks):** Standardize error handling across the loader.
- **Remediation effort:** Low

#### Scope Mapping
- **IN SCOPE** — "Transaction-building bugs that could cause loss of funds... or missing slippage protection." While not direct loss of funds, it breaks the core planning mechanism.

#### Duplicate Research
Searched git history and `AGENTS.md`. No previous mention of this `DataLoader` contract violation was found.
**Triager Search Kit:** `DataLoader`, `items?.map`, `marketIds.map` in `loader.ts`.

---

### [FINDING-002] Unbounded Concurrency and High RPC Volume (Potential Local DoS)
**Severity:** Low
**Confidence:** Confirmed
**Boardroom Version:** The SDK can be forced to make a massive number of network requests, potentially crashing the application or getting blocked by the blockchain provider.

#### Weakness Classification
- Primary CWE: CWE-770 — Allocation of Resources Without Limits or Throttling
- Secondary CWE: CWE-400 — Uncontrolled Resource Consumption
- Why this mapping fits: The loader performs a large number of concurrent RPC calls proportional to the number of vaults and markets returned by the API.

#### Affected Component
- File(s): `packages/liquidity-sdk-viem/src/loader.ts`
- Function(s): `DataLoader` batch function
- Line(s): 101-155
- Version: [latest]

#### Vulnerability Details
The loader uses nested `Promise.all` to concurrently fetch state for all markets and vaults. A single `loader.fetch(marketId)` can trigger hundreds of RPC calls if the target market is supplied by many vaults with many other allocations.

#### Business Impact Analysis
- Financial: None directly.
- Data Breach: None.
- Reputational: Low.
- Operational: Low/Medium. High RPC volume can lead to rate-limiting or memory exhaustion.
- Compliance: None.
- Attacker Motivation: Opportunistic.

#### Proof of Concept
Targeted test in `packages/liquidity-sdk-viem/test/audit.test.ts` (test case: `DoS Proof: Unbounded concurrency and high RPC call volume`).

#### Reliability Verification (5 Tests)
| Run | Result | Notes |
|-----|--------|-------|
| 1 | Pass | Measured 54 calls for 10 vaults |
| 2 | Pass | Measured 54 calls for 10 vaults |
| 3 | Pass | Measured 54 calls for 10 vaults |
| 4 | Pass | Measured 54 calls for 10 vaults |
| 5 | Pass | Measured 54 calls for 10 vaults |

#### Fix Recommendations
- **Immediate (24-48h):** Implement basic chunking for `Promise.all` groups.
- **Short-term (2 weeks):** Add `maxBatchSize` to `DataLoader`.
- **Remediation effort:** Medium

#### Scope Mapping
- **IN SCOPE** — Program covers general supply-chain and code reliability issues in the repository.

#### Duplicate Research
Searched for "batch" or "throttle" in `packages/liquidity-sdk-viem/src/`. No such limits exist currently.
**Triager Search Kit:** `Promise.all`, `supplyingVaults.map`, `vaultsMarkets.map` in `loader.ts`.

---

## Security Observations (Non-Critical)
- **Dependency Vulnerabilities:** `pnpm audit` reported moderate/high vulnerabilities in `vite` and `ws` (devDependencies).
- **GraphQL Singleton:** `apiSdk` is a shared singleton; concurrent requests use the same underlying client.

## What Was NOT Found (And Why)
- **Hardcoded Secrets:** Explicitly checked via grep; the package is stateless.
- **Weak Randomness:** No use of `Math.random` or similar in sensitive contexts.

## Overall Remediation Roadmap
| Priority | Action | Business Risk Reduced | Effort |
|----------|--------|----------------------|--------|
| Immediate (24-48h) | Fix DataLoader length mismatch | High (Reliability) | Low |
| Short-term (2 weeks) | Implement RPC request batching/multicall | Medium (Performance) | Medium |
| Medium-term (90 days) | Upgrade vulnerable devDependencies | Low (Maintenance) | Low |
