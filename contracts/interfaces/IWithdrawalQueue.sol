// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IWithdrawalQueue
 * @notice Interface for the WithdrawalQueue contract
 */
interface IWithdrawalQueue {
    /**
     * @notice Request withdrawal by locking stETH
     * @param _amount Amount of stETH to lock
     * @return Request ID (NFT token ID)
     */
    function requestWithdrawal(uint256 _amount) external returns (uint256);

    /**
     * @notice Request withdrawal by locking wstETH
     * @param _amount Amount of wstETH to lock
     * @return Request ID (NFT token ID)
     */
    function requestWithdrawalWstETH(uint256 _amount) external returns (uint256);

    /**
     * @notice Claim finalized withdrawal
     * @param _requestId Request ID (NFT token ID)
     */
    function claimWithdrawal(uint256 _requestId) external;

    /**
     * @notice Finalize withdrawal requests in batch
     * @param _requestIds Array of request IDs to finalize
     * @param _amounts Array of ETH amounts to distribute
     */
    function finalizeWithdrawals(uint256[] calldata _requestIds, uint256[] calldata _amounts) external;

    /**
     * @notice Get withdrawal request details
     * @param _requestId Request ID
     * @return amount Amount of stETH locked
     * @return timestamp Request timestamp
     * @return finalized Whether the request is finalized
     * @return claimable Whether the request is claimable
     */
    function getWithdrawalRequest(uint256 _requestId)
        external
        view
        returns (
            uint256 amount,
            uint256 timestamp,
            bool finalized,
            bool claimable
        );

    /**
     * @notice Get the staking pool address
     * @return Address of staking pool
     */
    function stakingPool() external view returns (address);
}
