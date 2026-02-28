// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IMockAccountingOracle
 * @notice Interface for the mock accounting oracle
 */
interface IMockAccountingOracle {
    /**
     * @notice Submit oracle report
     * @param _totalPooledEther Total pooled ETH
     * @param _exitedValidators Number of validators that exited
     * @param _withdrawalAmount Amount available for withdrawals
     */
    function submitReport(
        uint256 _totalPooledEther,
        uint256 _exitedValidators,
        uint256 _withdrawalAmount
    ) external;

    /**
     * @notice Get the staking pool address
     * @return Address of staking pool
     */
    function stakingPool() external view returns (address);

    /**
     * @notice Get the withdrawal queue address
     * @return Address of withdrawal queue
     */
    function withdrawalQueue() external view returns (address);
}
