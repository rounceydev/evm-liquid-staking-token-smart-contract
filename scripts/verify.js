const { run } = require("hardhat");

async function main() {
  const network = process.env.HARDHAT_NETWORK || "localhost";
  const fs = require("fs");
  const deploymentPath = `deployments/${network}.json`;

  if (!fs.existsSync(deploymentPath)) {
    console.error(`Deployment file not found: ${deploymentPath}`);
    console.log("Please deploy contracts first using: npx hardhat run scripts/deploy.js");
    process.exit(1);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const { contracts } = deploymentInfo;

  console.log(`Verifying contracts on ${network}...\n`);

  try {
    console.log("Verifying StakingPool...");
    await run("verify:verify", {
      address: contracts.stakingPool,
      constructorArguments: [],
    });
    console.log("✓ StakingPool verified\n");
  } catch (error) {
    console.log("✗ StakingPool verification failed:", error.message, "\n");
  }

  try {
    console.log("Verifying WstETH...");
    await run("verify:verify", {
      address: contracts.wstETH,
      constructorArguments: [],
    });
    console.log("✓ WstETH verified\n");
  } catch (error) {
    console.log("✗ WstETH verification failed:", error.message, "\n");
  }

  try {
    console.log("Verifying WithdrawalQueue...");
    await run("verify:verify", {
      address: contracts.withdrawalQueue,
      constructorArguments: [],
    });
    console.log("✓ WithdrawalQueue verified\n");
  } catch (error) {
    console.log("✗ WithdrawalQueue verification failed:", error.message, "\n");
  }

  try {
    console.log("Verifying MockOracle...");
    await run("verify:verify", {
      address: contracts.mockOracle,
      constructorArguments: [],
    });
    console.log("✓ MockOracle verified\n");
  } catch (error) {
    console.log("✗ MockOracle verification failed:", error.message, "\n");
  }

  console.log("Verification complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
