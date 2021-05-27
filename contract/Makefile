all: WrappedTalleoToken_sol_WrappedTalleoToken.abi TokenSwap_sol_TokenSwap.abi BalancedSwap_sol_BalancedSwap.abi

SafeMath.sol: ../node_modules/@openzeppelin/contracts/math/SafeMath.sol
	@cp ../node_modules/@openzeppelin/contracts/math/SafeMath.sol SafeMath.sol

WrappedTalleoToken_sol_WrappedTalleoToken.abi: WrappedTalleoToken.sol IERC20.sol SafeMath.sol
	@solcjs --base-path . --abi wrappedTalleoToken.sol

TokenSwap_sol_TokenSwap.abi: TokenSwap.sol IERC20.sol SafeMath.sol
	@solcjs --base-path . --abi TokenSwap.sol

BalancedSwap_sol_BalancedSwap.abi: BalancedSwap.sol IERC20.sol SafeMath.sol
	@solcjs --base-path . --abi BalancedSwap.sol
