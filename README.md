# EVM Liquid Staking Token Protocol

A complete Solidity-based liquid staking smart contract protocol inspired by Lido Finance's liquid staking on Ethereum. This project implements a simplified clone featuring stETH-like rebasing tokens, wstETH wrapper, withdrawal queue with ERC-721 NFTs, and mock oracle integration.

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Setup Instructions](#setup-instructions)
- [Testing](#testing)
- [Deployment](#deployment)
- [Usage Examples](#usage-examples)
- [Contract Details](#contract-details)
- [Assumptions & Limitations](#assumptions--limitations)
- [Contact](#contact)

## 🎯 Project Overview

This is a simplified educational clone of Lido Finance's liquid staking protocol designed for EVM-compatible blockchains. The protocol allows users to:

- **Deposit ETH** and receive liquid staking tokens (stETH) that represent their stake
- **Earn rewards** automatically as the protocol accrues staking rewards
- **Wrap/unwrap** stETH to wstETH (non-rebasing version) for DeFi compatibility
- **Request withdrawals** via a FIFO queue system with ERC-721 NFT representation
- **Claim withdrawals** after oracle finalization

The protocol uses a shares-based system to avoid rebasing transfers, where token balances are calculated dynamically based on the exchange rate between shares and pooled ETH.

## ✨ Key Features

### Core Functionality

1. **ETH Staking → Liquid Token**
   - Users deposit ETH via `submit()` function
   - Receive stETH tokens (rebasing ERC-20) representing their stake
   - Initial 1:1 ratio that grows with rewards

2. **Rebasing vs Wrapped Tokens**
   - **stETH**: Rebasing token where `balanceOf()` returns ETH value (shares × exchange rate)
   - **wstETH**: Non-rebasing wrapper with fixed balance that appreciates in value
   - Seamless wrap/unwrap between the two

3. **Withdrawal Request & Claims**
   - Request withdrawal by locking stETH/wstETH
   - Receive ERC-721 NFT (unstETH) representing withdrawal position
   - FIFO queue system for fair processing
   - Oracle finalizes requests in batches
   - Claim finalized withdrawals to receive ETH

4. **Mock Oracle Rewards**
   - Simulates beacon chain reports
   - Updates total pooled ETH (accrues rewards)
   - Finalizes withdrawal requests
   - Deducts treasury fees from rewards

5. **Governance & Access Control**
   - Role-based access control (OpenZeppelin)
   - Configurable treasury fees
   - Pausability for emergency stops
   - UUPS upgradeable proxy pattern

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interactions                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │         StakingPool (stETH)           │
        │  - Handles ETH deposits               │
        │  - Mints/burns shares (rebasing)      │
        │  - Processes oracle reports           │
        │  - Manages treasury fees              │
        └───────────────────────────────────────┘
                    │                    │
        ┌───────────┘                    └───────────┐
        ▼                                             ▼
┌───────────────┐                          ┌─────────────────────┐
│  WstETH       │                          │ WithdrawalQueueERC721│
│  - Wraps      │                          │  - FIFO queue        │
│    stETH      │                          │  - ERC-721 NFTs      │
│  - Unwraps    │                          │  - Lock tokens       │
│  - Non-rebasing│                         │  - Claim withdrawals │
└───────────────┘                          └─────────────────────┘
                                                    │
                                                    ▼
                                    ┌───────────────────────────┐
                                    │  MockAccountingOracle     │
                                    │  - Submit reports         │
                                    │  - Finalize withdrawals  │
                                    │  - Simulate rewards       │
                                    └───────────────────────────┘
```

### Contract Relationships

- **StakingPool**: Core contract managing ETH deposits, shares, and rewards
- **WstETH**: Wrapper contract for non-rebasing stETH
- **WithdrawalQueueERC721**: Manages withdrawal requests with NFT representation
- **MockAccountingOracle**: Simulates oracle reports for testing

## 🚀 Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Git

### Installation

1. **Clone the repository** (or navigate to project directory):
   ```bash
   cd evm-liquid-staking-token
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your configuration:
   ```env
   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
   PRIVATE_KEY=your_private_key_here
   ETHERSCAN_API_KEY=your_etherscan_api_key_here
   INITIAL_TREASURY_FEE=1000
   ```

4. **Compile contracts**:
   ```bash
   npx hardhat compile
   ```

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
npx hardhat test

# Run with coverage
npm run test:coverage

# Run specific test file
npx hardhat test test/StakingPool.test.js
```

### Test Coverage

The test suite covers:

- ✅ Deposit/mint functionality
- ✅ Wrapping/unwrapping stETH ↔ wstETH
- ✅ Withdrawal request/claim flows
- ✅ Oracle report processing
- ✅ Reward accrual over time
- ✅ Fee deductions
- ✅ Pausing mechanisms
- ✅ Edge cases (zero deposits, max queue, unauthorized access, insufficient buffer)
- ✅ Integration tests for complete flows

## 📦 Deployment

### Local Network

1. **Start local Hardhat node**:
   ```bash
   npx hardhat node
   ```

2. **Deploy contracts** (in another terminal):
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```

### Testnet (Sepolia)

1. **Configure `.env`** with your Sepolia RPC URL and private key

2. **Deploy**:
   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   ```

3. **Verify contracts** (optional):
   ```bash
   npx hardhat run scripts/verify.js --network sepolia
   ```

### Deployment Output

The deployment script creates a `deployments/{network}.json` file with all contract addresses and configuration.

## 💡 Usage Examples

### Using Ethers.js

```javascript
const { ethers } = require("ethers");
const StakingPool = require("./artifacts/contracts/StakingPool.sol/StakingPool.json");

// Connect to contract
const provider = new ethers.JsonRpcProvider("http://localhost:8545");
const signer = await provider.getSigner();
const stakingPool = new ethers.Contract(
  "0x...", // StakingPool address
  StakingPool.abi,
  signer
);

// 1. Deposit ETH
const tx1 = await stakingPool.submit({ value: ethers.parseEther("1.0") });
await tx1.wait();
console.log("Deposited 1 ETH");

// 2. Check balance (rebasing)
const balance = await stakingPool.balanceOf(signer.address);
console.log(`stETH balance: ${ethers.formatEther(balance)}`);

// 3. Wrap to wstETH
const wstETH = new ethers.Contract(/* wstETH address */, /* ABI */, signer);
await stakingPool.approve(wstETH.address, balance);
const tx2 = await wstETH.wrap(balance);
await tx2.wait();
console.log("Wrapped to wstETH");

// 4. Request withdrawal
const withdrawalQueue = new ethers.Contract(/* address */, /* ABI */, signer);
await stakingPool.approve(withdrawalQueue.address, ethers.parseEther("0.5"));
const tx3 = await withdrawalQueue.requestWithdrawal(ethers.parseEther("0.5"));
const receipt = await tx3.wait();
const requestId = receipt.logs[0].args.requestId;
console.log(`Withdrawal requested: NFT #${requestId}`);

// 5. Simulate oracle report (admin/oracle only)
const mockOracle = new ethers.Contract(/* address */, /* ABI */, signer);
const totalPooled = await stakingPool.getTotalPooledEther();
const reward = ethers.parseEther("0.1");
await mockOracle.submitReport(totalPooled + reward, 0, 0);
console.log("Oracle report submitted");

// 6. Finalize and claim withdrawal (oracle + funding required)
await mockOracle.finalizeWithdrawals([requestId], [ethers.parseEther("0.5")]);
await withdrawalQueue.claimWithdrawal(requestId);
console.log("Withdrawal claimed!");
```

### Using Hardhat Console

```bash
npx hardhat console --network localhost
```

```javascript
const [deployer, user] = await ethers.getSigners();
const StakingPool = await ethers.getContractFactory("StakingPool");
const stakingPool = StakingPool.attach("0x...");

// Deposit
await stakingPool.connect(user).submit({ value: ethers.parseEther("1.0") });

// Check balance
await stakingPool.balanceOf(user.address);
```

## 📄 Contract Details

### StakingPool

**Main Functions:**
- `submit()`: Deposit ETH and receive stETH shares
- `getPooledEthByShares(uint256)`: Convert shares to ETH
- `getSharesByPooledEth(uint256)`: Convert ETH to shares
- `burnShares(address, uint256)`: Burn shares (called by withdrawal queue)
- `processOracleReport(...)`: Update pool state with rewards

**Key Properties:**
- Rebasing token: `balanceOf()` returns ETH value, not shares
- Shares-based: Internal accounting uses shares to avoid rebasing transfers
- Treasury fees: Configurable fee on rewards (default 10%)

### WstETH

**Main Functions:**
- `wrap(uint256)`: Convert stETH to wstETH
- `unwrap(uint256)`: Convert wstETH to stETH
- `getStETHByWstETH(uint256)`: Get stETH value of wstETH
- `getWstETHByStETH(uint256)`: Get wstETH amount for stETH

**Key Properties:**
- Non-rebasing: Balance stays fixed, value appreciates
- 1:1 initial ratio with stETH
- Value increases as stETH accrues rewards

### WithdrawalQueueERC721

**Main Functions:**
- `requestWithdrawal(uint256)`: Lock stETH and receive NFT
- `requestWithdrawalWstETH(uint256)`: Lock wstETH and receive NFT
- `finalizeWithdrawals(uint256[], uint256[])`: Finalize requests (oracle only)
- `claimWithdrawal(uint256)`: Claim finalized withdrawal

**Key Properties:**
- FIFO queue: First-in-first-out processing
- ERC-721 NFTs: Each request is an NFT (unstETH)
- Requires ETH funding: Contract must have ETH to pay claims

### MockAccountingOracle

**Main Functions:**
- `submitReport(uint256, uint256, uint256)`: Submit oracle report
- `finalizeWithdrawals(uint256[], uint256[])`: Finalize withdrawal requests
- `submitReportAndFinalize(...)`: Combined operation

**Key Properties:**
- Mock implementation: For testing/educational purposes only
- Role-based: Requires ORACLE_ROLE
- Simulates real oracle: Updates pool state and finalizes withdrawals

## ⚠️ Assumptions & Limitations

### Educational/Demo Use Only

This is a **simplified clone** for educational purposes. For production use, you would need:

1. **Real Oracle Integration**
   - Actual beacon chain oracle daemon
   - Validator exit monitoring
   - Secure oracle infrastructure

2. **Professional Security Audit**
   - Comprehensive security review
   - Formal verification where applicable
   - Bug bounty program

3. **Validator Infrastructure**
   - Actual validator node setup
   - Slashing protection
   - Validator key management

4. **Enhanced Features**
   - MEV protection
   - Advanced fee mechanisms
   - Governance token and DAO
   - Insurance fund

### Current Limitations

- ✅ Mock oracle only (no real beacon chain integration)
- ✅ Simplified fee mechanism
- ✅ No validator management
- ✅ No slashing handling
- ✅ Basic withdrawal queue (no priority system)
- ✅ No insurance fund
- ✅ Simplified governance

## 🙏 Acknowledgments

- Inspired by [Lido Finance](https://lido.fi/)
- Built with [Hardhat](https://hardhat.org/)
- Uses [OpenZeppelin Contracts](https://www.openzeppelin.com/contracts/)

## 📚 Additional Resources

- [Lido Finance Documentation](https://docs.lido.fi/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Ethereum Staking](https://ethereum.org/en/staking/)

## 📧 Contact

- telegram: https://t.me/rouncey
- twitter:  https://x.com/rouncey_
