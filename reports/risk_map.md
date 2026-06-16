# Business Asset Risk Map

| Component | What It Does | Business Value | Data Sensitivity | Attack Priority |
|-----------|-------------|----------------|-----------------|----------------|
| `morpho-sdk` (Actions/Bundler) | Encodes transactions for Morpho Blue and MetaMorpho. | Critical (Funds) | Low (Public) | Critical |
| `blue-sdk-viem` (Signatures) | Handles Permit/Permit2 and Morpho authorization signatures. | Critical (Auth) | High (Private Keys) | Critical |
| `bundler-sdk-viem` | Builds bundles of actions for the Bundler contract. | High (Funds) | Low (Public) | High |
| `blue-sdk` (Math) | Core math for interest rates, shares, and rounding. | High (Accuracy) | Low (Public) | High |
| `evm-simulation` | Simulates Morpho transactions locally or via Tenderly. | Medium (Trust) | Medium (User State) | Medium |
| `liquidation-sdk-viem` | Logic for identifying and executing liquidations. | Medium (MEV/Safety) | Low (Public) | Medium |
| `liquidity-sdk-viem` | Fetches and calculates available liquidity. | Medium (Trade) | Low (Public) | Low |
