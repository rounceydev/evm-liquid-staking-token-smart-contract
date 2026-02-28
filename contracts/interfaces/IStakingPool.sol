// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IStakingPool
 * @notice Interface for the StakingPool contract
 */
interface IStakingPool {
    /**
     * @notice Submit ETH to the staking pool and receive stETH shares
     * @return Amount of stETH shares minted
     */
    function submit() external payable returns (uint256);

    /**
     * @notice Get the total amount of ETH pooled in the contract
     * @return Total pooled ETH
     */
    function getTotalPooledEther() external view returns (uint256);

    /**
     * @notice Get the total amount of shares in circulation
     * @return Total shares
     */
    function getTotalShares() external view returns (uint256);

    /**
     * @notice Get the amount of ETH that corresponds to a given amount of shares
     * @param _sharesAmount Amount of shares
     * @return Amount of ETH
     */
    function getPooledEthByShares(uint256 _sharesAmount) external view returns (uint256);

    /**
     * @notice Get the amount of shares that corresponds to a given amount of ETH
     * @param _ethAmount Amount of ETH
     * @return Amount of shares
     */
    function getSharesByPooledEth(uint256 _ethAmount) external view returns (uint256);

    /**
     * @notice Get the current exchange rate (shares per ETH)
     * @return Exchange rate as shares per ETH (scaled by 1e18)
     */
    function getExchangeRate() external view returns (uint256);

    /**
     * @notice Burn shares when requesting withdrawal
     * @param _account Address to burn shares from
     * @param _sharesAmount Amount of shares to burn
     */
    function burnShares(address _account, uint256 _sharesAmount) external;

    /**
     * @notice Process oracle report to update pool state
     * @param _totalPooledEther New total pooled ETH
     * @param _exitedValidators Number of validators that exited
     * @param _withdrawalAmount Amount available for withdrawals
     */
    function processOracleReport(
        uint256 _totalPooledEther,
        uint256 _exitedValidators,
        uint256 _withdrawalAmount
    ) external;

    /**
     * @notice Get the treasury fee in basis points
     * @return Treasury fee in basis points
     */
    function getTreasuryFee() external view returns (uint256);
}
