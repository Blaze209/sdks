VERDICT: VULNERABLE
Confidence: HIGH

Summary: The `BundlerAction.encodeBundle` function in `@morpho-org/bundler-sdk-viem` incorrectly calculates the native `value` for the resulting multicall transaction. It exclusively accounts for `nativeTransfer` actions, ignoring native currency requirements for other action types like Compound V2 ETH repayments and PublicAllocator fees.

Evidence
Code location: packages/bundler-sdk-viem/src/BundlerAction.ts:60
Actual code snippet (Original):
```typescript
    let value = 0n;

    for (const { type, args } of actions) {
      if (type !== "nativeTransfer") continue;

      const [owner, recipient, amount] = args;

      if (
        !isAddressEqual(owner, bundler3) &&
        !isAddressEqual(owner, generalAdapter1) &&
        (isAddressEqual(recipient, bundler3) ||
          isAddressEqual(recipient, generalAdapter1))
      )
        value += amount;
    }
```
The original code only accumulates `value` if the action type is explicitly `nativeTransfer`. However, other actions return non-zero `value` in their encoded `BundlerCall` objects. For example, `BundlerAction.compoundV2Repay` returns `value: amount` when `isEth` is true, but this was never added to the multicall's total value.

E2E PoC
File: packages/bundler-sdk-viem/src/VulnerabilityPoC.test.ts
Run command: `pnpm test packages/bundler-sdk-viem/src/VulnerabilityPoC.test.ts`
Expected output:
```
 ✓ bundler-sdk-viem  packages/bundler-sdk-viem/src/VulnerabilityPoC.test.ts (5 tests)
 Test Files  1 passed (1)
      Tests  5 passed (5)
```
Actual output:
```
 ✓ bundler-sdk-viem  packages/bundler-sdk-viem/src/VulnerabilityPoC.test.ts (5 tests)
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Why the report is correct: The manual verification confirms that various action types requiring native currency resulted in a transaction with `value: 0n` in the original implementation, which would cause the Bundler contract to revert on-chain due to insufficient ETH sent with the multicall.

Severity: High
Likelihood: High (Affects standard flows for repayments and reallocations requiring ETH)
Impact: High (Complete failure of intended transactions)
Justification: This is a critical functional bug in the SDK that prevents users from successfully executing common operations involving ETH through the bundler. While it doesn't represent a direct theft of funds, it breaks the core utility of the SDK.

Recommended Action: Report immediately.

Target asset: bundler-sdk-viem
Attack path: N/A (Functional bug)
Impact explanation: Users attempting to repay Compound V2 debts with ETH or perform public reallocations via the bundler SDK will have their transactions fail because the generated multicall does not include the necessary ETH.
PoC with verifiable output: See `packages/bundler-sdk-viem/src/VulnerabilityPoC.test.ts`.
Fix recommendation:
Refactor `encodeBundle` to sum the `value` fields from all results of `BundlerAction.encode`, while maintaining special handling for direct `nativeTransfer` calls to the bundler that do not result in individual encoded calls.

```typescript
  export function encodeBundle(chainId: ChainId, actions: Action[]) {
    const {
      bundler3: { bundler3, generalAdapter1 },
    } = getChainAddresses(chainId);

    const encodedActions = actions.flatMap(
      BundlerAction.encode.bind(null, chainId),
    );

    let value = 0n;

    for (const action of actions) {
      if (action.type !== "nativeTransfer") continue;

      const [owner, recipient, amount] = action.args;

      if (
        isAddressEqual(recipient, bundler3) &&
        !isAddressEqual(owner, bundler3) &&
        !isAddressEqual(owner, generalAdapter1)
      ) {
        value += amount;
      }
    }

    for (const call of encodedActions) {
      value += call.value;
    }

    return {
      to: bundler3,
      value,
      data: encodeFunctionData({
        abi: bundler3Abi,
        functionName: "multicall",
        args: [encodedActions],
      }),
    };
  }
```
