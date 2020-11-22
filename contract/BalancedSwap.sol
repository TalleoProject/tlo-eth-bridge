// SPDX-License-Identifier: LGPL-2.0-or-later
pragma solidity >= 0.7.0 <0.8.0;
import "IERC20.sol";
import "SafeMath.sol";

contract BalancedSwap {

using SafeMath for uint256;

address payable owner;
IERC20 firstToken;
IERC20 secondToken;
uint256 public feeMultiplier;
uint256 public feeDivisor;

modifier onlyOwner() {
    require(msg.sender == owner, "Only owner can call this function.");
    _;
}

constructor(IERC20 _first, IERC20 _second, uint256 _feeMultiplier, uint256 _feeDivisor) {
    owner = msg.sender;
    firstToken = _first;
    secondToken = _second;
    feeMultiplier = _feeMultiplier;
    feeDivisor = _feeDivisor;
}

function _swap(address _from, IERC20 _fromToken, IERC20 _toToken, uint256 _fromValue) internal returns (bool) {
    uint256 firstBalance = _fromToken.balanceOf(address(this)).add(_fromValue);
    uint256 secondBalance = _toToken.balanceOf(address(this));
    uint256 toValue = _fromValue.mul(secondBalance).div(firstBalance);
    toValue = toValue.sub(toValue.mul(feeMultiplier).div(feeDivisor));
    require(toValue > 0, "Nothing to swap");
    require(toValue <= secondBalance, "Not enough tokens in the reserve");
    uint256 allowance = firstToken.allowance(_from, address(this));
    require(allowance >= _fromValue, "Allowance is too low");
    firstToken.transferFrom(_from, address(this), _fromValue);
    secondToken.transfer(_from, toValue);
    emit Swapped(_from, _fromToken, _toToken, _fromValue, toValue);
    return true;
}

function swap1to2(uint256 _value) public returns (bool) {
    return _swap(msg.sender, firstToken, secondToken, _value);
}

function swap2to1(uint256 _value) public returns (bool) {
    return _swap(msg.sender, secondToken, firstToken, _value);
}

function setFee(uint256 _multiplier, uint256 _divisor) public onlyOwner returns (bool) {
    feeMultiplier = _multiplier;
    feeDivisor = _divisor;
    return true;
}

function withdrawAll() public onlyOwner returns (bool) {
    firstToken.transfer(owner, firstToken.balanceOf(address(this)));
    secondToken.transfer(owner, secondToken.balanceOf(address(this)));
    return true;
}

event Swapped(address indexed _user, IERC20 indexed _from, IERC20 indexed _to, uint256 _fromValue, uint256 _toValue);
}
