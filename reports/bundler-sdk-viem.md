# Security Audit Report — bundler-sdk-viem

**Date:** October 26, 2023
**Program:** Morpho Bug Bounty Program
**Scope:** Source code audit of packages/bundler-sdk-viem — authorized under program Safe Harbor

---

## Executive Summary
The security audit of the `@morpho-org/bundler-sdk-viem` package focused on the logic used to construct and optimize transaction bundles for the Morpho Bundler. The core functionality involves transforming high-level user operations into low-level calls to the Bundler contract and its various adapters.

Overall, the codebase demonstrates a high level of security awareness, with explicit checks against unauthorized signature usage and robust simulation-based optimization.

The most significant observations relate to:
1. **Signature Security:** Explicit guards prevent the use of signatures for the Bundler contract itself, ensuring they can only be used by authorized adapters like `GeneralAdapter1`.
2. **Fund Safety (Skimming):** A sophisticated skimming logic ensures that any surplus tokens resulting from slippage or exact-amount swaps are returned to the user. A safety check (delta balance) prevents the generation of bundles that would leave funds on the Bundler.
3. **Integration Risks:** Integration with external protocols like Paraswap relies on the correctness of provided call data and offsets. While the SDK handles these correctly, malicious or malformed inputs from upstream could lead to unexpected behavior.

No critical vulnerabilities were found during this audit. The identified risks are primarily informational or related to business logic robustness.

---

## Business Context
The `bundler-sdk-viem` is a critical component of the Morpho ecosystem, enabling users to perform complex, multi-step operations (e.g., "leveraged supply") in a single atomic transaction. It manages ERC20 approvals, permits (EIP-2612 and Permit2), and interactions with Morpho Blue and various migration adapters.

### Business Asset Risk Map

| Component | What It Does | Business Value | Data Sensitivity | Attack Priority |
|-----------|-------------|----------------|-----------------|----------------|
| BundlerAction | Encodes low-level calls | High (Transaction Integrity) | Low (Public Data) | High |
| operations.ts | Populates and optimizes bundles | High (Fund Safety/UX) | Low | High |
| actions.ts | Maps operations to actions | Medium (Mapping logic) | Low | Medium |

---

## Methodology
The audit was performed using static analysis of the source code, tracing data flows from user input (operations) to the final encoded transaction data. Specific focus was placed on:
- Signature handling and verification.
- Fund flow and the "skimming" mechanism.
- Integration with third-party adapters (Paraswap, Migration).
- Simulation-based optimizations.

---

## Findings

### [FINDING-001] Default `skipRevert=true` in `morphoSetAuthorizationWithSig`
**Severity:** Informational
**Confidence:** Confirmed
**Boardroom Version:** Authorization failures might be silenced, potentially leading to subsequent operations failing in a way that is harder to debug.

#### Weakness Classification
- Primary CWE: CWE-252 — Unchecked Return Value (Conceptual)
- Why this mapping fits: The SDK defaults to allowing signature-based authorizations to fail silently on-chain.

#### Affected Component
- File(s): `packages/bundler-sdk-viem/src/BundlerAction.ts`
- Function(s): `morphoSetAuthorizationWithSig`
- Line(s): 1076

#### Vulnerability Details
In `morphoSetAuthorizationWithSig`, the `skipRevert` parameter defaults to `true`. This means if an invalid signature is provided, the Bundler will attempt the call, it will revert (due to invalid signature), but the Bundler's `multicall` will continue to the next action if `skipRevert` is respected by the on-chain contract.

While this is often intended for UX (to allow a bundle to proceed if an authorization is already present), it can lead to situations where the user expects an authorization to be set, it fails, and subsequent actions that depend on that authorization fail with less descriptive errors.

#### Business Impact Analysis
- Financial: Low. No direct loss of funds.
- Data Breach: None.
- Reputational: Low. Potential for confusing user experience.
- Operational: Low. Harder debugging for failed transactions.

#### Fix Recommendations
- **Short-term:** Ensure that UIs using this SDK provide clear feedback if a signature is likely to be invalid before submission.
- **Long-term:** Consider changing the default to `false` for critical authorizations, or ensuring that simulation always catches these issues.

---

### [FINDING-002] Complexity and Simulation Dependency in `finalizeBundle` Skimming
**Severity:** Informational
**Confidence:** High
**Boardroom Version:** Incorrect simulation could theoretically lead to funds being left on the Bundler or bundle generation failure.

#### Weakness Classification
- Primary CWE: CWE-682 — Incorrect Calculation
- Why this mapping fits: The skimming logic relies on a simulation of the entire bundle to determine surplus.

#### Affected Component
- File(s): `packages/bundler-sdk-viem/src/operations.ts`
- Function(s): `finalizeBundle`
- Line(s): 578

#### Vulnerability Details
The `finalizeBundle` function uses `simulateBundlerOperations` to determine which tokens remain on the Bundler address after all operations. It then appends `skims` (transfers to the receiver) and performs a final simulation check:
```typescript
    const delta = lastHolding.balance - (firstHolding?.balance ?? 0n);
    if (delta > 0n) {
      throw new BundlerErrors.UnskimedToken(lastHolding.token);
    }
```
If the simulation is not perfectly aligned with the on-chain state (e.g., due to state changes between simulation and execution, or inaccuracies in the simulation logic), the generated bundle might:
1. Fail on-chain if it tries to skim more than available.
2. Leave funds on the Bundler if it skims less than available (though the delta check tries to prevent this).

#### Business Impact Analysis
- Financial: Medium. Funds could be trapped on the Bundler contract if skimming is insufficient and the delta check is somehow bypassed or if simulation is wrong.
- Operational: High. Bundle generation might fail for valid user requests if simulation fails the delta check.

#### Fix Recommendations
- **Long-term:** Continue to improve simulation accuracy and consider on-chain "skim all" functions in adapters if possible.

---

## Security Observations (Non-Critical)

### Paraswap CallData and Offsets
The SDK trusts the `callData` and `offsets` provided in the `Paraswap_Buy/Sell` operations. While the SDK correctly wraps these in transfers to/from the `ParaswapAdapter`, if the upstream source of this data (e.g., an API) is compromised, it could lead to the user's funds being swapped under unfavorable conditions. This is an external integration risk.

---

## Methodology Verification
The audit covered the full attack surface identified in Phase 1.
- Signature verification logic was audited in `actions.ts` and `BundlerAction.ts`.
- Fund flow and skimming were audited in `operations.ts`.
- External adapter integrations were audited in `BundlerAction.ts` and `actions.ts`.

## Overall Remediation Roadmap
| Priority | Action | Business Risk Reduced | Effort |
|----------|--------|----------------------|--------|
| Short-term | Review default `skipRevert` settings in client-facing applications. | Improved UX and debuggability. | Low |
| Long-term | Enhance simulation-to-onchain consistency checks. | Reduced risk of trapped funds/failed bundles. | Medium |
