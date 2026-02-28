// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IWithdrawalQueue.sol";
import "./interfaces/IStakingPool.sol";
import "./interfaces/IWstETH.sol";

/**
 * @title WithdrawalQueueERC721
 * @notice FIFO queue for withdrawal requests with ERC-721 NFT representation
 * @dev Inspired by Lido Finance's withdrawal queue
 */
contract WithdrawalQueueERC721 is
    IWithdrawalQueue,
    ERC721Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Staking pool contract address
    address private _stakingPool;

    /// @notice wstETH contract address
    address private _wstETH;

    /// @notice Counter for request IDs (NFT token IDs)
    uint256 private _requestIdCounter;

    /// @notice Withdrawal request structure
    struct WithdrawalRequest {
        uint256 amount; // Amount of stETH locked (in stETH terms, not shares)
        uint256 timestamp; // Request timestamp
        bool finalized; // Whether the request is finalized
        bool claimable; // Whether the request is claimable
        uint256 claimableAmount; // Amount of ETH claimable
        address owner; // Original requester
    }

    /// @notice Mapping from request ID to withdrawal request
    mapping(uint256 => WithdrawalRequest) private _requests;

    /// @notice Array of pending request IDs (FIFO queue)
    uint256[] private _pendingRequests;

    /// @dev Events
    event WithdrawalRequested(
        address indexed requester,
        uint256 indexed requestId,
        uint256 amount,
        bool isWstETH
    );
    event WithdrawalFinalized(uint256 indexed requestId, uint256 claimableAmount);
    event WithdrawalClaimed(address indexed claimer, uint256 indexed requestId, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param _stakingPoolAddress Staking pool address
     * @param _wstETHAddress wstETH address
     * @param _admin Admin address
     */
    function initialize(
        address _stakingPoolAddress,
        address _wstETHAddress,
        address _admin
    ) public initializer {
        __ERC721_init("Unstaked Liquid Staking Token", "unstETH");
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        require(_stakingPoolAddress != address(0), "WithdrawalQueue: zero staking pool address");
        require(_wstETHAddress != address(0), "WithdrawalQueue: zero wstETH address");
        require(_admin != address(0), "WithdrawalQueue: zero admin address");

        _stakingPool = _stakingPoolAddress;
        _wstETH = _wstETHAddress;
        _requestIdCounter = 1; // Start from 1

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(GOVERNANCE_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
    }

    /**
     * @notice Request withdrawal by locking stETH
     * @param _amount Amount of stETH to lock
     * @return Request ID (NFT token ID)
     */
    function requestWithdrawal(uint256 _amount) external override whenNotPaused nonReentrant returns (uint256) {
        require(_amount > 0, "WithdrawalQueue: zero amount");

        // Convert stETH amount to shares
        IStakingPool stakingPool = IStakingPool(_stakingPool);
        uint256 sharesAmount = stakingPool.getSharesByPooledEth(_amount);

        // Transfer stETH shares from user (shares are the actual token units)
        IERC20(_stakingPool).transferFrom(msg.sender, address(this), sharesAmount);

        // Burn shares from this contract
        stakingPool.burnShares(address(this), sharesAmount);

        // Create withdrawal request
        uint256 requestId = _requestIdCounter++;
        _requests[requestId] = WithdrawalRequest({
            amount: _amount,
            timestamp: block.timestamp,
            finalized: false,
            claimable: false,
            claimableAmount: 0,
            owner: msg.sender
        });

        _pendingRequests.push(requestId);

        // Mint NFT to user
        _safeMint(msg.sender, requestId);

        emit WithdrawalRequested(msg.sender, requestId, _amount, false);
        return requestId;
    }

    /**
     * @notice Request withdrawal by locking wstETH
     * @param _amount Amount of wstETH to lock
     * @return Request ID (NFT token ID)
     */
    function requestWithdrawalWstETH(uint256 _amount) external override whenNotPaused nonReentrant returns (uint256) {
        require(_amount > 0, "WithdrawalQueue: zero amount");

        // Transfer wstETH from user
        IERC20(_wstETH).transferFrom(msg.sender, address(this), _amount);

        // Unwrap wstETH to stETH (this contract receives stETH shares)
        IWstETH wstETH = IWstETH(_wstETH);
        uint256 stETHAmount = wstETH.unwrap(_amount);

        // Get actual shares received (stETH tokens are shares)
        IStakingPool stakingPool = IStakingPool(_stakingPool);
        uint256 sharesAmount = IERC20(_stakingPool).balanceOf(address(this));

        // Burn shares from this contract
        require(sharesAmount > 0, "WithdrawalQueue: zero shares");
        stakingPool.burnShares(address(this), sharesAmount);

        // Create withdrawal request
        uint256 requestId = _requestIdCounter++;
        _requests[requestId] = WithdrawalRequest({
            amount: stETHAmount,
            timestamp: block.timestamp,
            finalized: false,
            claimable: false,
            claimableAmount: 0,
            owner: msg.sender
        });

        _pendingRequests.push(requestId);

        // Mint NFT to user
        _safeMint(msg.sender, requestId);

        emit WithdrawalRequested(msg.sender, requestId, stETHAmount, true);
        return requestId;
    }

    /**
     * @notice Finalize withdrawal requests in batch
     * @param _requestIds Array of request IDs to finalize
     * @param _amounts Array of ETH amounts to distribute
     */
    function finalizeWithdrawals(uint256[] calldata _requestIds, uint256[] calldata _amounts)
        external
        override
        onlyRole(ORACLE_ROLE)
    {
        require(_requestIds.length == _amounts.length, "WithdrawalQueue: length mismatch");

        for (uint256 i = 0; i < _requestIds.length; i++) {
            uint256 requestId = _requestIds[i];
            uint256 amount = _amounts[i];

            WithdrawalRequest storage request = _requests[requestId];
            require(request.amount > 0, "WithdrawalQueue: invalid request");
            require(!request.finalized, "WithdrawalQueue: already finalized");

            request.finalized = true;
            request.claimable = true;
            request.claimableAmount = amount;

            // Remove from pending queue
            _removeFromPendingQueue(requestId);

            emit WithdrawalFinalized(requestId, amount);
        }
    }

    /**
     * @notice Claim finalized withdrawal
     * @param _requestId Request ID (NFT token ID)
     */
    function claimWithdrawal(uint256 _requestId) external override whenNotPaused nonReentrant {
        require(_ownerOf(_requestId) == msg.sender, "WithdrawalQueue: not owner");

        WithdrawalRequest storage request = _requests[_requestId];
        require(request.claimable, "WithdrawalQueue: not claimable");
        require(request.claimableAmount > 0, "WithdrawalQueue: zero claimable amount");

        uint256 amount = request.claimableAmount;
        request.claimableAmount = 0;
        request.claimable = false;

        // Burn NFT
        _burn(_requestId);

        // Transfer ETH to user
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "WithdrawalQueue: ETH transfer failed");

        emit WithdrawalClaimed(msg.sender, _requestId, amount);
    }

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
        override
        returns (
            uint256 amount,
            uint256 timestamp,
            bool finalized,
            bool claimable
        )
    {
        WithdrawalRequest memory request = _requests[_requestId];
        return (request.amount, request.timestamp, request.finalized, request.claimable);
    }

    /**
     * @notice Get the claimable amount for a request
     * @param _requestId Request ID
     * @return Claimable amount in ETH
     */
    function getClaimableAmount(uint256 _requestId) external view returns (uint256) {
        return _requests[_requestId].claimableAmount;
    }

    /**
     * @notice Get the staking pool address
     * @return Address of staking pool
     */
    function stakingPool() external view override returns (address) {
        return _stakingPool;
    }

    /**
     * @notice Get pending request count
     * @return Number of pending requests
     */
    function getPendingRequestCount() external view returns (uint256) {
        return _pendingRequests.length;
    }

    /**
     * @notice Get pending request IDs
     * @param _offset Offset
     * @param _limit Limit
     * @return Array of request IDs
     */
    function getPendingRequests(uint256 _offset, uint256 _limit) external view returns (uint256[] memory) {
        uint256 length = _pendingRequests.length;
        if (_offset >= length) {
            return new uint256[](0);
        }

        uint256 end = _offset + _limit;
        if (end > length) {
            end = length;
        }

        uint256[] memory result = new uint256[](end - _offset);
        for (uint256 i = _offset; i < end; i++) {
            result[i - _offset] = _pendingRequests[i];
        }
        return result;
    }

    /**
     * @notice Remove request from pending queue
     * @param _requestId Request ID to remove
     */
    function _removeFromPendingQueue(uint256 _requestId) private {
        uint256 length = _pendingRequests.length;
        for (uint256 i = 0; i < length; i++) {
            if (_pendingRequests[i] == _requestId) {
                _pendingRequests[i] = _pendingRequests[length - 1];
                _pendingRequests.pop();
                break;
            }
        }
    }

    /**
     * @notice Pause withdrawals
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause withdrawals
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(GOVERNANCE_ROLE) {}

    /**
     * @notice Receive ETH for withdrawals
     */
    receive() external payable {}
}
