all: WrappedTalleoToken_sol_WrappedTalleoToken.abi TokenSwap_sol_TokenSwap.abi BalancedSwap_sol_BalancedSwap.abi TokenMarket_sol_TokenMarket.abi

WrappedTalleoToken_sol_WrappedTalleoToken.abi: WrappedTalleoToken.sol IERC20.sol
	@solcjs --base-path . --abi WrappedTalleoToken.sol

TokenSwap_sol_TokenSwap.abi: TokenSwap.sol IERC20.sol
	@solcjs --base-path . --abi TokenSwap.sol

BalancedSwap_sol_BalancedSwap.abi: BalancedSwap.sol IERC20.sol
	@solcjs --base-path . --abi BalancedSwap.sol

TokenMarket_sol_TokenMarket.abi: TokenMarket.sol IERC20.sol
	@solcjs --base-path . --abi TokenMarket.sol
