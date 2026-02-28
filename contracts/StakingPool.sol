// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IStakingPool.sol";

/**
 * @title StakingPool
 * @notice Main staking pool contract that handles ETH deposits and mints rebasing stETH tokens
 * @dev Inspired by Lido Finance's stETH implementation
 */
contract StakingPool is
    IStakingPool,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Total amount of ETH pooled in the contract
    uint256 private _totalPooledEther;

    /// @notice Treasury fee in basis points (10000 = 100%)
    uint256 private _treasuryFeeBP;

    /// @notice Treasury address that receives fees
    address private _treasury;

    /// @notice Withdrawal queue contract address
    address private _withdrawalQueue;

    /// @notice Accounting oracle contract address
    address private _accountingOracle;

    /// @dev Events
    event Submitted(address indexed sender, uint256 amount, uint256 shares);
    event SharesBurnt(address indexed account, uint256 preRebaseTokenAmount, uint256 postRebaseTokenAmount, uint256 sharesAmount);
    event OracleReportProcessed(uint256 totalPooledEther, uint256 treasuryFee, uint256 rewards);
    event TreasuryFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event WithdrawalQueueUpdated(address oldQueue, address newQueue);
    event AccountingOracleUpdated(address oldOracle, address newOracle);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _admin Admin address
     * @param _treasuryAddress Treasury address
     * @param _initialTreasuryFee Initial treasury fee in basis points
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _admin,
        address _treasuryAddress,
        uint256 _initialTreasuryFee
    ) public initializer {
        __ERC20_init(_name, _symbol);
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        require(_admin != address(0), "StakingPool: zero admin address");
        require(_treasuryAddress != address(0), "StakingPool: zero treasury address");
        require(_initialTreasuryFee <= 5000, "StakingPool: fee too high"); // Max 50%

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(GOVERNANCE_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);

        _treasury = _treasuryAddress;
        _treasuryFeeBP = _initialTreasuryFee;
        _totalPooledEther = 0;
    }

    /**
     * @notice Submit ETH to the staking pool and receive stETH shares
     * @return Amount of stETH shares minted
     */
    function submit() external payable whenNotPaused nonReentrant returns (uint256) {
        require(msg.value > 0, "StakingPool: zero amount");

        uint256 sharesAmount = getSharesByPooledEth(msg.value);
        if (sharesAmount == 0) {
            // First deposit: 1:1 ratio
            sharesAmount = msg.value;
        }

        _totalPooledEther += msg.value;
        _mint(msg.sender, sharesAmount);

        emit Submitted(msg.sender, msg.value, sharesAmount);
        return sharesAmount;
    }

    /**
     * @notice Get the total amount of ETH pooled in the contract
     * @return Total pooled ETH
     */
    function getTotalPooledEther() external view override returns (uint256) {
        return _totalPooledEther;
    }

    /**
     * @notice Get the total amount of shares in circulation
     * @return Total shares
     */
    function getTotalShares() public view override returns (uint256) {
        return totalSupply();
    }

    /**
     * @notice Get the amount of ETH that corresponds to a given amount of shares
     * @param _sharesAmount Amount of shares
     * @return Amount of ETH
     */
    function getPooledEthByShares(uint256 _sharesAmount) public view override returns (uint256) {
        uint256 totalShares = getTotalShares();
        if (totalShares == 0) {
            return 0;
        }
        return (_sharesAmount * _totalPooledEther) / totalShares;
    }

    /**
     * @notice Get the amount of shares that corresponds to a given amount of ETH
     * @param _ethAmount Amount of ETH
     * @return Amount of shares
     */
    function getSharesByPooledEth(uint256 _ethAmount) public view override returns (uint256) {
        uint256 totalShares = getTotalShares();
        if (totalShares == 0 || _totalPooledEther == 0) {
            return _ethAmount; // 1:1 for first deposit
        }
        return (_ethAmount * totalShares) / _totalPooledEther;
    }

    /**
     * @notice Get the current exchange rate (shares per ETH)
     * @return Exchange rate as shares per ETH (scaled by 1e18)
     */
    function getExchangeRate() public view override returns (uint256) {
        if (_totalPooledEther == 0) {
            return 1e18; // 1:1 initial rate
        }
        return (getTotalShares() * 1e18) / _totalPooledEther;
    }

    /**
     * @notice Get the balance of an account in ETH terms (rebasing)
     * @param account Account address
     * @return Balance in ETH
     */
    function balanceOf(address account) public view override returns (uint256) {
        return getPooledEthByShares(super.balanceOf(account));
    }

    /**
     * @notice Burn shares when requesting withdrawal
     * @param _account Address to burn shares from
     * @param _sharesAmount Amount of shares to burn
     */
    function burnShares(address _account, uint256 _sharesAmount) external override {
        require(msg.sender == _withdrawalQueue, "StakingPool: only withdrawal queue");
        require(_sharesAmount > 0, "StakingPool: zero shares");

        uint256 preRebaseTokenAmount = getPooledEthByShares(_sharesAmount);
        _burn(_account, _sharesAmount);
        uint256 postRebaseTokenAmount = getPooledEthByShares(_sharesAmount);

        emit SharesBurnt(_account, preRebaseTokenAmount, postRebaseTokenAmount, _sharesAmount);
    }

    /**
     * @notice Process oracle report to update pool state
     * @param _totalPooledEther New total pooled ETH
     * @param _exitedValidators Number of validators that exited (unused in this simplified version)
     * @param _withdrawalAmount Amount available for withdrawals
     */
    function processOracleReport(
        uint256 _totalPooledEther,
        uint256 _exitedValidators,
        uint256 _withdrawalAmount
    ) external override onlyRole(ORACLE_ROLE) {
        // Get current state via getter (parameter shadows state variable)
        uint256 previousTotalPooledEther = this.getTotalPooledEther();
        require(_totalPooledEther >= previousTotalPooledEther, "StakingPool: invalid report");
        require(_withdrawalAmount <= _totalPooledEther, "StakingPool: invalid withdrawal amount");

        uint256 rewards = _totalPooledEther > previousTotalPooledEther
            ? _totalPooledEther - previousTotalPooledEther
            : 0;

        if (rewards > 0) {
            uint256 treasuryFee = (rewards * _treasuryFeeBP) / 10000;

            // Send treasury fee
            if (treasuryFee > 0 && _treasury != address(0)) {
                (bool success, ) = _treasury.call{value: treasuryFee}("");
                require(success, "StakingPool: treasury transfer failed");
                _totalPooledEther = _totalPooledEther - treasuryFee; // Deduct from pool
            } else {
                _totalPooledEther = _totalPooledEther;
            }
        } else {
            _totalPooledEther = _totalPooledEther;
        }

        emit OracleReportProcessed(_totalPooledEther, (rewards * _treasuryFeeBP) / 10000, rewards);
    }

    /**
     * @notice Get the treasury fee in basis points
     * @return Treasury fee in basis points
     */
    function getTreasuryFee() external view override returns (uint256) {
        return _treasuryFeeBP;
    }

    /**
     * @notice Set the treasury fee
     * @param _newFee New treasury fee in basis points
     */
    function setTreasuryFee(uint256 _newFee) external onlyRole(GOVERNANCE_ROLE) {
        require(_newFee <= 5000, "StakingPool: fee too high");
        uint256 oldFee = _treasuryFeeBP;
        _treasuryFeeBP = _newFee;
        emit TreasuryFeeUpdated(oldFee, _newFee);
    }

    /**
     * @notice Set the treasury address
     * @param _newTreasury New treasury address
     */
    function setTreasury(address _newTreasury) external onlyRole(GOVERNANCE_ROLE) {
        require(_newTreasury != address(0), "StakingPool: zero address");
        address oldTreasury = _treasury;
        _treasury = _newTreasury;
        emit TreasuryUpdated(oldTreasury, _newTreasury);
    }

    /**
     * @notice Set the withdrawal queue address
     * @param _newQueue New withdrawal queue address
     */
    function setWithdrawalQueue(address _newQueue) external onlyRole(GOVERNANCE_ROLE) {
        require(_newQueue != address(0), "StakingPool: zero address");
        address oldQueue = _withdrawalQueue;
        _withdrawalQueue = _newQueue;
        emit WithdrawalQueueUpdated(oldQueue, _newQueue);
    }

    /**
     * @notice Set the accounting oracle address
     * @param _newOracle New oracle address
     */
    function setAccountingOracle(address _newOracle) external onlyRole(GOVERNANCE_ROLE) {
        require(_newOracle != address(0), "StakingPool: zero address");
        address oldOracle = _accountingOracle;
        _accountingOracle = _newOracle;
        emit AccountingOracleUpdated(oldOracle, _newOracle);
    }

    /**
     * @notice Pause deposits and withdrawals
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause deposits and withdrawals
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(GOVERNANCE_ROLE) {}

    /**
     * @notice Receive ETH
     */
    receive() external payable {
        revert("StakingPool: use submit()");
    }
}
