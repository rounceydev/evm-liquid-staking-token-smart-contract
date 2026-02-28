// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IMockAccountingOracle.sol";
import "../interfaces/IStakingPool.sol";
import "../interfaces/IWithdrawalQueue.sol";

/**
 * @title MockAccountingOracle
 * @notice Mock oracle for simulating beacon chain reports
 * @dev This is a simplified mock for testing/educational purposes only
 */
contract MockAccountingOracle is IMockAccountingOracle, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    /// @notice Staking pool contract address
    address private _stakingPool;

    /// @notice Withdrawal queue contract address
    address private _withdrawalQueue;

    /// @dev Events
    event ReportSubmitted(
        uint256 totalPooledEther,
        uint256 exitedValidators,
        uint256 withdrawalAmount
    );
    event StakingPoolUpdated(address oldPool, address newPool);
    event WithdrawalQueueUpdated(address oldQueue, address newQueue);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param _stakingPoolAddress Staking pool address
     * @param _withdrawalQueueAddress Withdrawal queue address
     * @param _admin Admin address
     */
    function initialize(
        address _stakingPoolAddress,
        address _withdrawalQueueAddress,
        address _admin
    ) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        require(_stakingPoolAddress != address(0), "MockOracle: zero staking pool address");
        require(_withdrawalQueueAddress != address(0), "MockOracle: zero withdrawal queue address");
        require(_admin != address(0), "MockOracle: zero admin address");

        _stakingPool = _stakingPoolAddress;
        _withdrawalQueue = _withdrawalQueueAddress;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(GOVERNANCE_ROLE, _admin);
        _grantRole(ORACLE_ROLE, _admin);
    }

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
    ) external override onlyRole(ORACLE_ROLE) {
        // Process report in staking pool
        IStakingPool(_stakingPool).processOracleReport(
            _totalPooledEther,
            _exitedValidators,
            _withdrawalAmount
        );

        emit ReportSubmitted(_totalPooledEther, _exitedValidators, _withdrawalAmount);
    }

    /**
     * @notice Finalize withdrawal requests (simplified batch finalization)
     * @param _requestIds Array of request IDs to finalize
     * @param _amounts Array of ETH amounts to distribute
     */
    function finalizeWithdrawals(uint256[] calldata _requestIds, uint256[] calldata _amounts)
        external
        onlyRole(ORACLE_ROLE)
    {
        IWithdrawalQueue(_withdrawalQueue).finalizeWithdrawals(_requestIds, _amounts);
    }

    /**
     * @notice Submit report and finalize withdrawals in one call
     * @param _totalPooledEther Total pooled ETH
     * @param _exitedValidators Number of validators that exited
     * @param _withdrawalAmount Amount available for withdrawals
     * @param _requestIds Array of request IDs to finalize
     * @param _claimableAmounts Array of ETH amounts to distribute
     */
    function submitReportAndFinalize(
        uint256 _totalPooledEther,
        uint256 _exitedValidators,
        uint256 _withdrawalAmount,
        uint256[] calldata _requestIds,
        uint256[] calldata _claimableAmounts
    ) external onlyRole(ORACLE_ROLE) {
        // Submit report
        submitReport(_totalPooledEther, _exitedValidators, _withdrawalAmount);

        // Finalize withdrawals if any
        if (_requestIds.length > 0) {
            finalizeWithdrawals(_requestIds, _claimableAmounts);
        }
    }

    /**
     * @notice Get the staking pool address
     * @return Address of staking pool
     */
    function stakingPool() external view override returns (address) {
        return _stakingPool;
    }

    /**
     * @notice Get the withdrawal queue address
     * @return Address of withdrawal queue
     */
    function withdrawalQueue() external view override returns (address) {
        return _withdrawalQueue;
    }

    /**
     * @notice Set the staking pool address
     * @param _newPool New staking pool address
     */
    function setStakingPool(address _newPool) external onlyRole(GOVERNANCE_ROLE) {
        require(_newPool != address(0), "MockOracle: zero address");
        address oldPool = _stakingPool;
        _stakingPool = _newPool;
        emit StakingPoolUpdated(oldPool, _newPool);
    }

    /**
     * @notice Set the withdrawal queue address
     * @param _newQueue New withdrawal queue address
     */
    function setWithdrawalQueue(address _newQueue) external onlyRole(GOVERNANCE_ROLE) {
        require(_newQueue != address(0), "MockOracle: zero address");
        address oldQueue = _withdrawalQueue;
        _withdrawalQueue = _newQueue;
        emit WithdrawalQueueUpdated(oldQueue, _newQueue);
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(GOVERNANCE_ROLE) {}
}
