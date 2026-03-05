const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const network = process.env.HARDHAT_NETWORK || "localhost";
  const deploymentPath = `deployments/${network}.json`;

  if (!fs.existsSync(deploymentPath)) {
    console.error(`Deployment file not found: ${deploymentPath}`);
    process.exit(1);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const { contracts } = deploymentInfo;

  const [deployer, user] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  // Get contracts
  const StakingPool = await ethers.getContractFactory("StakingPool");
  const WstETH = await ethers.getContractFactory("WstETH");
  const WithdrawalQueue = await ethers.getContractFactory("WithdrawalQueueERC721");
  const MockOracle = await ethers.getContractFactory("MockAccountingOracle");

  const stakingPool = StakingPool.attach(contracts.stakingPool);
  const wstETH = WstETH.attach(contracts.wstETH);
  const withdrawalQueue = WithdrawalQueue.attach(contracts.withdrawalQueue);
  const mockOracle = MockOracle.attach(contracts.mockOracle);

  console.log("\n=== Contract Addresses ===");
  console.log("StakingPool:", contracts.stakingPool);
  console.log("WstETH:", contracts.wstETH);
  console.log("WithdrawalQueue:", contracts.withdrawalQueue);
  console.log("MockOracle:", contracts.mockOracle);

  // Example interactions
  console.log("\n=== Example: Deposit ETH ===");
  const depositAmount = ethers.parseEther("1.0");
  console.log(`Depositing ${ethers.formatEther(depositAmount)} ETH...`);
  
  const tx = await stakingPool.connect(user).submit({ value: depositAmount });
  await tx.wait();
  console.log("✓ Deposit successful!");

  const balance = await stakingPool.balanceOf(user.address);
  console.log(`User stETH balance: ${ethers.formatEther(balance)} stETH`);

  console.log("\n=== Example: Wrap stETH to wstETH ===");
  const wrapAmount = ethers.parseEther("0.5");
  await stakingPool.connect(user).approve(contracts.wstETH, wrapAmount);
  const wrapTx = await wstETH.connect(user).wrap(wrapAmount);
  await wrapTx.wait();
  console.log("✓ Wrapped successfully!");

  const wstETHBalance = await wstETH.balanceOf(user.address);
  console.log(`User wstETH balance: ${ethers.formatEther(wstETHBalance)} wstETH`);

  console.log("\n=== Example: Submit Oracle Report ===");
  const totalPooled = await stakingPool.getTotalPooledEther();
  const reward = ethers.parseEther("0.1");
  const newTotalPooled = totalPooled + reward;
  
  const oracleTx = await mockOracle.submitReport(newTotalPooled, 0, 0);
  await oracleTx.wait();
  console.log("✓ Oracle report submitted!");

  const newBalance = await stakingPool.balanceOf(user.address);
  console.log(`User stETH balance after rewards: ${ethers.formatEther(newBalance)} stETH`);

  console.log("\n=== Interaction Examples Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
