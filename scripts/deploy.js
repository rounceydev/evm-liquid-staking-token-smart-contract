const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Configuration
  const INITIAL_TREASURY_FEE = process.env.INITIAL_TREASURY_FEE_BP || 1000; // 10%
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address; // Use deployer as treasury if not set

  console.log("\n=== Deploying StakingPool ===");
  const StakingPool = await ethers.getContractFactory("StakingPool");
  const stakingPool = await upgrades.deployProxy(
    StakingPool,
    [
      "Liquid Staking Token",
      "stETH",
      deployer.address, // admin
      TREASURY_ADDRESS, // treasury
      INITIAL_TREASURY_FEE,
    ],
    { initializer: "initialize" }
  );
  await stakingPool.waitForDeployment();
  const stakingPoolAddress = await stakingPool.getAddress();
  console.log("StakingPool deployed to:", stakingPoolAddress);

  console.log("\n=== Deploying WstETH ===");
  const WstETH = await ethers.getContractFactory("WstETH");
  const wstETH = await upgrades.deployProxy(
    WstETH,
    [stakingPoolAddress, deployer.address], // stETH address, admin
    { initializer: "initialize" }
  );
  await wstETH.waitForDeployment();
  const wstETHAddress = await wstETH.getAddress();
  console.log("WstETH deployed to:", wstETHAddress);

  console.log("\n=== Deploying WithdrawalQueueERC721 ===");
  const WithdrawalQueue = await ethers.getContractFactory("WithdrawalQueueERC721");
  const withdrawalQueue = await upgrades.deployProxy(
    WithdrawalQueue,
    [stakingPoolAddress, wstETHAddress, deployer.address], // staking pool, wstETH, admin
    { initializer: "initialize" }
  );
  await withdrawalQueue.waitForDeployment();
  const withdrawalQueueAddress = await withdrawalQueue.getAddress();
  console.log("WithdrawalQueue deployed to:", withdrawalQueueAddress);

  console.log("\n=== Deploying MockAccountingOracle ===");
  const MockOracle = await ethers.getContractFactory("MockAccountingOracle");
  const mockOracle = await upgrades.deployProxy(
    MockOracle,
    [stakingPoolAddress, withdrawalQueueAddress, deployer.address], // staking pool, withdrawal queue, admin
    { initializer: "initialize" }
  );
  await mockOracle.waitForDeployment();
  const mockOracleAddress = await mockOracle.getAddress();
  console.log("MockOracle deployed to:", mockOracleAddress);

  console.log("\n=== Setting up connections ===");
  
  // Set withdrawal queue in staking pool
  console.log("Setting withdrawal queue in StakingPool...");
  await stakingPool.setWithdrawalQueue(withdrawalQueueAddress);
  
  // Set oracle in staking pool
  console.log("Setting accounting oracle in StakingPool...");
  await stakingPool.setAccountingOracle(mockOracleAddress);

  // Grant ORACLE_ROLE to mock oracle
  console.log("Granting ORACLE_ROLE to MockOracle...");
  const ORACLE_ROLE = await stakingPool.ORACLE_ROLE();
  await stakingPool.grantRole(ORACLE_ROLE, mockOracleAddress);

  // Grant ORACLE_ROLE to withdrawal queue
  console.log("Granting ORACLE_ROLE to WithdrawalQueue...");
  const WITHDRAWAL_ORACLE_ROLE = await withdrawalQueue.ORACLE_ROLE();
  await withdrawalQueue.grantRole(WITHDRAWAL_ORACLE_ROLE, mockOracleAddress);

  console.log("\n=== Deployment Summary ===");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("StakingPool (stETH):", stakingPoolAddress);
  console.log("WstETH:", wstETHAddress);
  console.log("WithdrawalQueue (unstETH):", withdrawalQueueAddress);
  console.log("MockAccountingOracle:", mockOracleAddress);
  console.log("Treasury:", TREASURY_ADDRESS);
  console.log("Initial Treasury Fee:", INITIAL_TREASURY_FEE, "basis points (", INITIAL_TREASURY_FEE / 100, "%)");

  console.log("\n=== Verification Info ===");
  console.log("To verify contracts, run:");
  console.log(`npx hardhat verify --network ${network.name} ${stakingPoolAddress}`);
  console.log(`npx hardhat verify --network ${network.name} ${wstETHAddress}`);
  console.log(`npx hardhat verify --network ${network.name} ${withdrawalQueueAddress}`);
  console.log(`npx hardhat verify --network ${network.name} ${mockOracleAddress}`);

  // Save deployment addresses
  const deploymentInfo = {
    network: network.name,
    deployer: deployer.address,
    contracts: {
      stakingPool: stakingPoolAddress,
      wstETH: wstETHAddress,
      withdrawalQueue: withdrawalQueueAddress,
      mockOracle: mockOracleAddress,
    },
    treasury: TREASURY_ADDRESS,
    initialTreasuryFee: INITIAL_TREASURY_FEE,
    timestamp: new Date().toISOString(),
  };

  const fs = require("fs");
  const deploymentPath = `deployments/${network.name}.json`;
  if (!fs.existsSync("deployments")) {
    fs.mkdirSync("deployments");
  }
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to: ${deploymentPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
