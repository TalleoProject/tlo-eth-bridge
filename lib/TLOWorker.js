/*jslint bitwise: true */
var base58 = require('@mtl1979/base58-native');
var fs = require('fs');
var Web3 = require('web3');
require('./logger.js');
require('./configReader.js');
var apiInterfaces = require('./apiInterfaces.js')(global.config.talleo.daemon, global.config.talleo.wallet);

var logTalleo = 'talleo';
require('./exceptionWriter.js')(logTalleo);

var log = function (severity, system, text, data) {
    "use strict";
    global.log(severity, system, text, data);
};

var lastBlockFound, lastTopBlock = -1, TLOTransactions = {}, ETHAddresses = {};

var indexes = "0123456789abcdefABCDEF";

function eth_to_payment_id(address) {
    "use strict";
    var pid = "", i, t1, t2, t3, t4, a;

    for (i = 2; i < 42; i += 4) {
        t1 = indexes.indexOf(address.charAt(i));
        t2 = indexes.indexOf(address.charAt(i + 1));
        t3 = indexes.indexOf(address.charAt(i + 2));
        t4 = indexes.indexOf(address.charAt(i + 3));
        a = t1 >> 1;
        pid += a.toString(16);
        a = ((t1 & 1) << 3) + (t2 >> 2);
        pid += a.toString(16);
        a = ((t2 & 3) << 2) + (t3 >> 3);
        pid += a.toString(16);
        a = ((t3 & 7) << 1) + (t4 >> 4);
        pid += a.toString(16);
        a = (t4 & 15);
        pid += a.toString(16);
    }
    return pid.padEnd(64, 0);
}

function payment_id_to_eth(pid) {
    "use strict";
    var address = "0x", i, a;
    for (i = 0; i < 54; i += 5) {
        a = (parseInt(pid.charAt(i), 16) << 1) + (parseInt(pid.charAt(i + 1), 16) >> 3);
        address += indexes.charAt(a);
        a = ((parseInt(pid.charAt(i + 1), 16) & 7) << 2) + (parseInt(pid.charAt(i + 2), 16) >> 2);
        address += indexes.charAt(a);
        a = ((parseInt(pid.charAt(i + 2), 16) & 3) << 3) + (parseInt(pid.charAt(i + 3), 16) >> 1);
        address += indexes.charAt(a);
        a = ((parseInt(pid.charAt(i + 3), 16) & 1) << 4) + parseInt(pid.charAt(i + 4), 16);
        address += indexes.charAt(a);
    }
    return address.substring(0, 42);
}

async function getCurrentHeight() {
    var promise = new Promise((resolve, reject) =>
        apiInterfaces.jsonDaemon('/getheight', null, function (error, result) {
            if (error) {
                log('error', logTalleo, 'Error "%s" while trying to get current block height', [error]);
                reject(new Error(error.message));
            }
            if (result) {
                resolve(result.network_height);
            } else {
                reject(new Error('Invalid response from getheight!'));
            }
        })
    );
    return await promise;
}
async function getConfirmations(txHash) {
    "use strict";
    try {
        var currentHeight = await getCurrentHeight(), confirmations = 0;

        var promise = new Promise((resolve, reject) =>
            apiInterfaces.rpcWallet('getTransaction', {'transactionHash': txHash}, function (error, result) {
                if (error) {
                    log('error', logTalleo, 'Error "%s" while trying to get transaction with hash "%s"', [error, txHash]);
                    reject(new Error(error.message));
                }
                TLOTransactions[txHash] = result.transaction;
                if (result.transaction.blockIndex > 0) {
                    if (result.transaction.blockIndex > lastBlockFound) {
                        global.redisClient.hset('tlo-base-bridge:talleo', 'lastBlockFound', result.transaction.blockIndex, function (error1) {
                            if (error1) {
                                log('error', logTalleo, 'Error "%s" while trying to update last block found from %d to %d', [error1, lastBlockFound, result.transaction.blockIndex]);
                                reject(new Error(error1));
                            }
                            lastBlockFound = result.transaction.blockIndex;
                        });
                    }
                    confirmations = currentHeight - result.transaction.blockIndex;
                    resolve(confirmations);
                }
                resolve(0);
            })
        );
        confirmations = await promise;
        return confirmations;
    } catch (error) {
        log('error', logTalleo, "getConfirmations() caught exception: %s", [error.message]);
        return 0;
    }
}

function confirmTalleoTransaction(txHash) {
    "use strict";
    setTimeout(async function() {

        // Get current number of confirmations and compare it with sought-for value
        var txConfirmations, TLOTransaction;
        txConfirmations = await getConfirmations(txHash);

        log('info', logTalleo, 'Transaction with hash %s has %d confirmation(s)', [txHash, txConfirmations]);

        if (txConfirmations >= (global.config.talleo.confirmations || 10)) {
            // Handle confirmation event according to your business logic

            log('info', logTalleo, 'Transaction with hash %s has been successfully confirmed', [txHash]);

            if (typeof TLOTransactions[txHash] === 'undefined') {
                return;
            }

            TLOTransaction = TLOTransactions[txHash];
            global.redisClient.hget('tlo-base-bridge:talleo', 'conversion' + txHash, function (error, result) {
                // Check that we haven't processed this conversion request already, minimum amount is 1 WTLO
                if (result === null && TLOTransaction.amount > 100) {
                    var web3 = new Web3(new Web3.providers.WebsocketProvider(global.config.ethereum.wssNode));
                    web3.eth.accounts.privateKeyToAccount(global.config.ethereum.ownerKey);
                    fs.readFile(global.config.ethereum.contractABI, { encoding: 'utf-8' }, function (error1, data) {
                        if (error1) {
                            log('error', logTalleo, 'Error "%s" while trying to read contract ABI from file "%s"', [error1, global.config.ethereum.contractABI]);
                            return;
                        }
                        var tokenContract = new web3.eth.Contract(JSON.parse(data), global.config.ethereum.contractAddress);
                        var ETHAddress = payment_id_to_eth(TLOTransaction.paymentId);
                        if (!Web3.utils.isAddress(ETHAddress)) {
                            log('error', logTalleo, 'Invalid address "%s" in conversion request', [ETHAddress]);
                            return;
                        }
                        if (ETHAddress.toLowerCase() == global.config.ethereum.ownerAddress.toLowerCase()) {
                            log('error', logTalleo, 'Trying to send tokens to owner address');
                            return;
                        }
                        if (ETHAddress.toLowerCase() == '0x0000000000000000000000000000000000000000') {
                            log('error', logTalleo, 'Trying to send tokens to NULL address');
                            return;
                        }
                        if (global.config.ethereum.blacklist) {
                            for (var i = 0; i < global.config.ethereum.blacklist.length; i++) {
                                if (global.config.ethereum.blacklist[i].toLowerCase() == ETHAddress.toLowerCase()) {
                                    log('error', logTalleo, 'Trying to send tokens to blacklisted address');
                                    return;
                                }
                            }
                        }
                        if (ETHAddresses[ETHAddress.toLowerCase()]) {
                            var lastConversion = ETHAddresses[ETHAddress.toLowerCase()];
                            if (Date.now() - lastConversion < 86400000) {
                                log('info', logTalleo, 'Trying to send tokens to same destination address too fast');
                                setTimeout(function() {
                                    confirmTalleoTransaction(txHash);
                                }, 86400000);
                                return;
                            }
                        }
                        ETHAddresses[ETHAddress.toLowerCase()] = Date.now();
                        var account = web3.eth.accounts.wallet.add(global.config.ethereum.ownerKey);
                        web3.eth.getBlock("latest", false, (error2, result2) => {
                            if (error2) {
                              log('error', logTalleo, 'Error "%s" while trying to get gas limit', [error2]);
                              confirmTalleoTransaction(txHash);
                              return;
                            }
                            var _gasLimit = result2.gasLimit;
                            if (result2.transactions.length != 0) {
                              _gasLimit = Math.floor(_gasLimit / result2.transactions.length);
                            }
                            if (_gasLimit < global.config.ethereum.gas) {
                              _gasLimit = global.config.ethereum.gas;
                            }
                            if (_gasLimit > (global.config.ethereum.gas * 3)) {
                              _gasLimit = global.config.ethereum.gas * 3;
                            }
                            web3.eth.getGasPrice(async function (error3, _gasPrice) {
                                if (error3) {
                                  log('error', logTalleo, 'Error "%s" while trying to get gas price', [error3]);
                                  confirmTalleoTransaction(txHash);
                                  return;
                                }
                                var _hex_gasLimit = web3.utils.toHex(_gasLimit.toString());
                                var _hex_gasPrice = web3.utils.toHex(_gasPrice.toString());
                                var _hex_gas = web3.utils.toHex((global.config.ethereum.gas || 120000).toString());

                                var ownerBalance = await web3.eth.getBalance(account.address);
                                log('info', logTalleo, 'Gas price %s ETH, gas limit %s', [(_gasPrice / 1e18).toFixed(9), _gasLimit]);
                                var requiredBalance = (_gasPrice * _gasLimit);
                                log('info', logTalleo, 'Current balance %s ETH, required balance %s ETH!', [(ownerBalance / 1e18).toFixed(18), (requiredBalance / 1e18).toFixed(18)]);
                                if (ownerBalance < requiredBalance) {
                                    log('error', logTalleo, 'Ethereum wallet does not have enough balance!');
                                    setTimeout(function() {
                                        confirmTalleoTransaction(txHash);
                                    }, 3600000);
                                    return;
                                }

                                web3.eth.getTransactionCount(global.config.ethereum.ownerAddress, 'pending').then(
                                nonce => {
                                    var _hex_nonce = web3.utils.toHex(nonce);

                                    web3.eth.accounts.signTransaction(
                                    {
                                        nonce: _hex_nonce,
                                        from: global.config.ethereum.ownerAddress,
                                        to: global.config.ethereum.contractAddress,
                                        gasPrice: _hex_gasPrice,
                                        gasLimit: _hex_gasLimit,
                                        gas: _hex_gas,
                                        value: '0x0',
                                        data: tokenContract.methods.convertFrom(
                                                  base58.decode(global.config.talleo.bridgeAddress),
                                                  ETHAddress,
                                                  web3.eth.abi.encodeParameter('uint256', TLOTransaction.amount)
                                              ).encodeABI()
                                    }, global.config.ethereum.ownerKey, function (error4, result4) {
                                        if (error4) {
                                            log('error', logTalleo, 'Error "%s" while trying to sign transaction', [error4]);
                                            confirmTalleoTransaction(txHash);
                                            return;
                                        }
                                        web3.eth.sendSignedTransaction(result4.rawTransaction, function (error5, result5) {
                                            if (error5) {
                                                log('error', logTalleo, 'Error "%s" while trying to send signed transaction to notify contract', [error5]);
                                                confirmTalleoTransaction(txHash);
                                                return;
                                            }
                                        }).on('receipt', function (result6) {
                                            var hash = result6.transactionHash;
                                            delete TLOTransactions[txHash];
                                            global.redisClient.hset('tlo-base-bridge:talleo', 'conversion' + txHash, hash, function (error7, result7) {
                                                var amount = TLOTransaction.amount / 100;
                                                if (error7) {
                                                    log('error', logTalleo, 'Error "%s" while trying to store conversion request with TLO hash "%s", ETH hash "%s", recipient %s and amount %s TLO', [error7, txHash, hash, ETHAddress, amount.toFixed(2)]);
                                                    return;
                                                }
                                                log('info', logTalleo, 'Conversion request with recipient %s and amount %s TLO sent with hash %s', [ETHAddress, amount.toFixed(2), hash]);
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                }
            });
            return;
        }
        // Recursive call
        confirmTalleoTransaction(txHash);
        return;
    }, 30000);
}

function parseBlock(block) {
    "use strict";
    var i;
    for (i = 0; i < block.transactionHashes.length; i = i + 1) {
        confirmTalleoTransaction(block.transactionHashes[i]);
    }
}

function scanTransactions(firstBlock) {
    "use strict";
    var blockCount, i;
    apiInterfaces.rpcWallet('getStatus', {}, function(error, result) {
        if (error) {
            log('error', logTalleo, 'Error "%s" while trying to get current block height', [error]);
            process.exit(1);
            //setTimeout(scanTransactions(firstBlock), 1000);
            //return;
        }
        if (result.blockCount != lastTopBlock) {
            log('info', logTalleo, 'Current block height: %d', [result.blockCount]);
            lastTopBlock = result.blockCount;
        }
        if (firstBlock < lastTopBlock) {
            blockCount = firstBlock + 999 < lastTopBlock ? 1000 : (lastTopBlock - firstBlock);
            apiInterfaces.rpcWallet('getTransactionHashes', {
                'addresses': [global.config.talleo.bridgeAddress],
                'firstBlockIndex': firstBlock,
                'blockCount': blockCount
            }, function (error1, result1) {
                if (error1) {
                    log('error', logTalleo, 'Error "%s" while trying to get transactions from block %d to %d', [error1.message, firstBlock, (firstBlock + blockCount - 1)]);
                    if (firstBlock === 0) {
                        process.exit(1);
                    }
                    setTimeout(function() {
                        scanTransactions(firstBlock)
                    }, 1000);
                    return;
                }
                log('info', logTalleo, 'Scanning from %d to %d...', [firstBlock, firstBlock + blockCount - 1]);
                if (result1 && result1.items) {
                    for (i = 0; i < result1.items.length; i = i + 1) {
                        parseBlock(result1.items[i]);
                    }
                }
                // Recurse
                setTimeout(function() {
                    scanTransactions(firstBlock + blockCount);
                }, 1000);
            });
        } else {
           setTimeout(function() {
               scanTransactions(firstBlock);
           }, 1000);
        }
    });
}

(function init() {
    "use strict";
    global.redisClient.hget('tlo-base-bridge:talleo', 'lastBlockFound', function (error, result) {
        if (error) {
            lastBlockFound = 0;
        } else {
            lastBlockFound = result ? parseInt(result) : 0;
        }
        scanTransactions(lastBlockFound === 0 ? (global.config.talleo.startHeight || 0) : lastBlockFound + 1);
    });
}());
