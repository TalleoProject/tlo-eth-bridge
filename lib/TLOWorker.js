/*jslint bitwise: true */
var base58 = require('base58-native');
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

var lastBlockFound, lastTopBlock = -1, TLOTransactions = {};

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
            resolve(result.network_height);
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
                        global.redisClient.hset('talleo', 'lastBlockFound', result.transaction.blockIndex, function (error1) {
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
    setTimeout(async function () {

        // Get current number of confirmations and compare it with sought-for value
        var txConfirmations, TLOTransaction;
        txConfirmations = await getConfirmations(txHash);

        log('info', logTalleo, 'Transaction with hash %s has %d confirmation(s)', [txHash, txConfirmations]);

        if (txConfirmations >= (global.config.talleo.confirmations || 10)) {
            // Handle confirmation event according to your business logic

            log('info', logTalleo, 'Transaction with hash %s has been successfully confirmed', [txHash]);

            TLOTransaction = TLOTransactions[txHash];
            global.redisClient.hget('talleo', 'conversion' + txHash, function (error, result) {
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
                        web3.eth.getBlock("latest", false, (error1, result1) => {
                            var _gasLimit = result1.gasLimit;
                            web3.eth.getGasPrice(function (error2, result2) {
                                var _gasPrice = result2;
                                var _hex_gasLimit = web3.utils.toHex((_gasLimit + 1000000).toString());
                                var _hex_gasPrice = web3.utils.toHex(_gasPrice.toString());
                                var _hex_Gas = web3.utils.toHex((global.config.ethereum.gas || 120000).toString());

                                web3.eth.getTransactionCount(global.config.ethereum.ownerAddress).then(
                                nonce => {
                                    var _hex_nonce = web3.utils.toHex(nonce);

                                    web3.eth.accounts.wallet.add(global.config.ethereum.ownerKey);
                                    web3.eth.accounts.signTransaction(
                                    {
                                        nonce: _hex_nonce,
                                        from: global.config.ethereum.ownerAddress,
                                        to: global.config.ethereum.contractAddress,
                                        gasPrice: _hex_gasPrice,
                                        gasLimit: _hex_gasLimit,
                                        gas: _hex_Gas,
                                        value: '0x0',
                                        data: tokenContract.methods.convertFrom(
                                                  base58.decode(global.config.talleo.bridgeAddress),
                                                  ETHAddress,
                                                  web3.eth.abi.encodeParameter('uint256', TLOTransaction.amount)
                                              ).encodeABI()
                                    }, global.config.ethereum.ownerKey, function (error3, result3) {
                                        if (error3) {
                                            log('error', logTalleo, 'Error "%s" while trying to send signed transaction to notify contract', [error3]);
                                            return confirmTalleoTransaction(txHash);
                                        }
                                        web3.eth.sendSignedTransaction(result3.rawTransaction, function (error4, result4) {
                                            if (error4) {
                                                log('error', logTalleo, 'Error "%s" while trying to send signed transaction to notify contract', [error4]);
                                                return confirmTalleoTransaction(txHash);
                                            }
                                        }).on('receipt', function (result5) {
                                            var hash = result5.transactionHash;
                                            global.redisClient.hset('talleo', 'conversion' + txHash, hash, function (error6, result6) {
                                                var amount = TLOTransaction.amount / 100;
                                                if (error6) {
                                                    log('error', logTalleo, 'Error "%s" while trying to store conversion request with TLO hash "%s", ETH hash "%s", recipient %s and amount %s TLO', [error6, txHash, hash, ETHAddress, amount.toFixed(2)]);
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
        return confirmTalleoTransaction(txHash);
    }, 30 * 1000);
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
    apiInterfaces.jsonDaemon('/getheight', null, function (error, result) {
        if (error) {
            log('error', logTalleo, 'Error "%s" while trying to get current block height', [error]);
            process.exit(1);
            //setTimeout(scanTransactions(firstBlock), 1000);
            //return;
        }
        if (result.network_height != lastTopBlock) {
            log('info', logTalleo, 'Current block height: %d', [result.network_height]);
            lastTopBlock = result.network_height;
        }
        if (firstBlock < (lastTopBlock - 3)) {
            blockCount = firstBlock + 999 < (lastTopBlock - 3) ? 1000 : (lastTopBlock - 3 - firstBlock);
            apiInterfaces.rpcWallet('getTransactionHashes', {
                'addresses': [global.config.talleo.bridgeAddress],
                'firstBlockIndex': firstBlock,
                'blockCount': blockCount
            }, function (error, result) {
                if (error) {
                    log('error', logTalleo, 'Error "%s" while trying to get transactions from block %d to %d', [error.message, firstBlock, (firstBlock + blockCount - 1)]);
                    if (firstBlock === 0) {
                        process.exit(1);
                    }
                    setTimeout(function() {
                        scanTransactions(firstBlock)
                    }, 1000);
                    return;
                }
                log('info', logTalleo, 'Scanning from %d to %d...', [firstBlock, firstBlock + blockCount - 1]);
                if (result && result.items) {
                    for (i = 0; i < result.items.length; i = i + 1) {
                        parseBlock(result.items[i]);
                    }
                }
                // Recurse
                setTimeout(function () {
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
    global.redisClient.hget('talleo', 'lastBlockFound', function (error, result) {
        if (error) {
            lastBlockFound = 0;
        } else {
            lastBlockFound = result ? parseInt(result) : 0;
        }
        scanTransactions(lastBlockFound === 0 ? (global.config.talleo.startHeight || 0) : lastBlockFound + 1);
    });
}());
