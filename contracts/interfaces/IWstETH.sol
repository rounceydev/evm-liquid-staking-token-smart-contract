// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IWstETH
 * @notice Interface for the wstETH wrapper contract
 */
interface IWstETH {
    /**
     * @notice Wrap stETH to wstETH
     * @param _stETHAmount Amount of stETH to wrap
     * @return Amount of wstETH minted
     */
    function wrap(uint256 _stETHAmount) external returns (uint256);

    /**
     * @notice Unwrap wstETH to stETH
     * @param _wstETHAmount Amount of wstETH to unwrap
     * @return Amount of stETH received
     */
    function unwrap(uint256 _wstETHAmount) external returns (uint256);

    /**
     * @notice Get the amount of stETH that corresponds to a given amount of wstETH
     * @param _wstETHAmount Amount of wstETH
     * @return Amount of stETH
     */
    function getStETHByWstETH(uint256 _wstETHAmount) external view returns (uint256);

    /**
     * @notice Get the amount of wstETH that corresponds to a given amount of stETH
     * @param _stETHAmount Amount of stETH
     * @return Amount of wstETH
     */
    function getWstETHByStETH(uint256 _stETHAmount) external view returns (uint256);

    /**
     * @notice Get the stETH token address
     * @return Address of stETH token
     */
    function stETH() external view returns (address);
}
