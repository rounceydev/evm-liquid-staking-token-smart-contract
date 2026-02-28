// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IWstETH.sol";
import "./interfaces/IStakingPool.sol";

/**
 * @title WstETH
 * @notice Non-rebasing wrapper for stETH (wstETH)
 * @dev Inspired by Lido Finance's wstETH implementation
 */
contract WstETH is IWstETH, ERC20Upgradeable, AccessControlUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    /// @notice Address of the stETH token (StakingPool)
    address private _stETH;

    /// @dev Events
    event Wrapped(address indexed account, uint256 stETHAmount, uint256 wstETHAmount);
    event Unwrapped(address indexed account, uint256 wstETHAmount, uint256 stETHAmount);
    event StETHUpdated(address oldStETH, address newStETH);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param _stETHAddress Address of the stETH token
     * @param _admin Admin address
     */
    function initialize(address _stETHAddress, address _admin) public initializer {
        __ERC20_init("Wrapped Liquid Staking Token", "wstETH");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        require(_stETHAddress != address(0), "WstETH: zero stETH address");
        require(_admin != address(0), "WstETH: zero admin address");

        _stETH = _stETHAddress;
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(GOVERNANCE_ROLE, _admin);
    }

    /**
     * @notice Wrap stETH to wstETH
     * @param _stETHAmount Amount of stETH to wrap
     * @return Amount of wstETH minted
     */
    function wrap(uint256 _stETHAmount) external override nonReentrant returns (uint256) {
        require(_stETHAmount > 0, "WstETH: zero amount");

        // Transfer stETH from user
        IERC20(_stETH).transferFrom(msg.sender, address(this), _stETHAmount);

        // Calculate wstETH amount based on current exchange rate
        uint256 wstETHAmount = getWstETHByStETH(_stETHAmount);

        // Mint wstETH to user
        _mint(msg.sender, wstETHAmount);

        emit Wrapped(msg.sender, _stETHAmount, wstETHAmount);
        return wstETHAmount;
    }

    /**
     * @notice Unwrap wstETH to stETH
     * @param _wstETHAmount Amount of wstETH to unwrap
     * @return Amount of stETH received
     */
    function unwrap(uint256 _wstETHAmount) external override nonReentrant returns (uint256) {
        require(_wstETHAmount > 0, "WstETH: zero amount");

        // Burn wstETH from user
        _burn(msg.sender, _wstETHAmount);

        // Calculate stETH amount based on current exchange rate
        uint256 stETHAmount = getStETHByWstETH(_wstETHAmount);

        // Transfer stETH to user
        IERC20(_stETH).transfer(msg.sender, stETHAmount);

        emit Unwrapped(msg.sender, _wstETHAmount, stETHAmount);
        return stETHAmount;
    }

    /**
     * @notice Get the amount of stETH that corresponds to a given amount of wstETH
     * @param _wstETHAmount Amount of wstETH
     * @return Amount of stETH
     */
    function getStETHByWstETH(uint256 _wstETHAmount) public view override returns (uint256) {
        uint256 totalWstETH = totalSupply();
        if (totalWstETH == 0) {
            return _wstETHAmount; // 1:1 initial rate
        }

        // Get total stETH balance held by this contract
        uint256 totalStETH = IERC20(_stETH).balanceOf(address(this));
        return (_wstETHAmount * totalStETH) / totalWstETH;
    }

    /**
     * @notice Get the amount of wstETH that corresponds to a given amount of stETH
     * @param _stETHAmount Amount of stETH
     * @return Amount of wstETH
     */
    function getWstETHByStETH(uint256 _stETHAmount) public view override returns (uint256) {
        uint256 totalWstETH = totalSupply();
        uint256 totalStETH = IERC20(_stETH).balanceOf(address(this));

        if (totalWstETH == 0 || totalStETH == 0) {
            return _stETHAmount; // 1:1 initial rate
        }

        return (_stETHAmount * totalWstETH) / totalStETH;
    }

    /**
     * @notice Get the stETH token address
     * @return Address of stETH token
     */
    function stETH() external view override returns (address) {
        return _stETH;
    }

    /**
     * @notice Set the stETH token address
     * @param _newStETH New stETH address
     */
    function setStETH(address _newStETH) external onlyRole(GOVERNANCE_ROLE) {
        require(_newStETH != address(0), "WstETH: zero address");
        address oldStETH = _stETH;
        _stETH = _newStETH;
        emit StETHUpdated(oldStETH, _newStETH);
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(GOVERNANCE_ROLE) {}
}
