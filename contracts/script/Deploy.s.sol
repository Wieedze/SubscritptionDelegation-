// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MockERC20} from "../src/MockERC20.sol";

/// @dev Minimal Vm cheatcode surface — avoids depending on forge-std.
interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envOr(string calldata name, string calldata defaultValue) external view returns (string memory);
    function envOr(string calldata name, uint256 defaultValue) external view returns (uint256);
}

/// @notice Deploys MockERC20 to the configured network.
///         Configure via env: TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS.
///
///         forge script script/Deploy.s.sol:Deploy \
///           --rpc-url sepolia --broadcast --private-key $ORG_PRIVATE_KEY
contract Deploy {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (MockERC20 token) {
        string memory tokenName = vm.envOr("TOKEN_NAME", string("Subscription Test USD"));
        string memory tokenSymbol = vm.envOr("TOKEN_SYMBOL", string("subUSD"));
        uint256 decimals = vm.envOr("TOKEN_DECIMALS", uint256(6));

        vm.startBroadcast();
        token = new MockERC20(tokenName, tokenSymbol, uint8(decimals));
        vm.stopBroadcast();
    }
}
