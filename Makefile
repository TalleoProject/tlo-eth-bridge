ALL: contracts

config.json:
	@echo Please rename config.json.sample to config.json and fill in the details
	@false

contracts: contract/Makefile config.json node_modules/web3/dist/web3.min.js
	@cd contract && $(MAKE)
	@echo -n "var WrappedTalleoToken = '" > website/WrappedTalleoToken.js
	@cat contract/wrappedTalleoToken_sol_WrappedTalleoToken.abi >> website/WrappedTalleoToken.js
	@echo "';" >> website/WrappedTalleoToken.js
	@sed -n -e 's/\s*"contractAddress": "\(0x[0-9a-fA-F]*\)",/var contractAddress = "\1";/p' < config.json >> website/WrappedTalleoToken.js
	@sed -n -e 's/\s*"bridgeAddress": "\(TA[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]*\)",/var bridgeAddress = "\1";/p' < config.json >> website/WrappedTalleoToken.js
	@cp node_modules/web3/dist/web3.min.js website/web3.min.js
