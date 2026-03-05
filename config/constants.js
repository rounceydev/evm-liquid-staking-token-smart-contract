/**
 * @fileoverview Configuration constants for the liquid staking protocol
 * Note: Amount values are in wei (use ethers.parseEther() in scripts/tests)
 */

module.exports = {
  // Fee configuration (in basis points, 10000 = 100%)
  INITIAL_TREASURY_FEE_BP: 1000, // 10%
  MAX_TREASURY_FEE_BP: 5000, // 50% maximum

  // Withdrawal queue configuration (values in wei, use parseEther in code)
  MIN_WITHDRAWAL_AMOUNT_ETH: "0.001", // 0.001 ETH minimum
  MAX_WITHDRAWAL_AMOUNT_ETH: "1000000", // 1M ETH maximum

  // Oracle configuration
  ORACLE_REPORT_TIMEOUT: 86400, // 24 hours in seconds

  // Pause configuration
  PAUSE_DURATION: 86400, // 24 hours

  // Role names (use keccak256 in contracts)
  ROLE_NAMES: {
    GOVERNANCE_ROLE: "GOVERNANCE_ROLE",
    ORACLE_ROLE: "ORACLE_ROLE",
    PAUSER_ROLE: "PAUSER_ROLE",
  },
};
