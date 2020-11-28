// SPDX-License-Identifier: LGPL-2.0-or-later
pragma solidity >= 0.5.0 <0.7.6;
import "IERC20.sol";
import "SafeMath.sol";

contract TokenSwap {

using SafeMath for uint256;

address payable owner;
IERC20 firstToken;
IERC20 secondToken;
uint256 public conversionMultiplier;
uint256 public conversionDivisor;

modifier onlyOwner() {
    require(msg.sender == owner, "Only owner can call this function.");
    _;
}

constructor(IERC20 first, IERC20 second, uint256 _conversionMultiplier, uint256 _conversionDivisor) {
    owner = msg.sender;
    firstToken = first;
    secondToken = second;
    conversionMultiplier = _conversionMultiplier;
    conversionDivisor = _conversionDivisor;
}

function swap(uint256 amount) public returns (bool) {
    uint256 swapBalance = secondToken.balanceOf(address(this));
    uint256 secondAmount = amount.mul(conversionMultiplier).div(conversionDivisor);
    require(secondAmount > 0, "Nothing to swap");
    require(secondAmount <= swapBalance, "Not enough tokens in the reserve");
    uint256 allowance = firstToken.allowance(msg.sender, address(this));
    require(allowance >= amount, "Allowance is too low");
    firstToken.transferFrom(msg.sender, address(this), amount);
    secondToken.transfer(msg.sender, secondAmount);
    emit Swapped(msg.sender, amount, secondAmount);
    return true;
}

function conversionRate(uint256 multiplier, uint256 divisor) public onlyOwner returns (bool) {
    conversionMultiplier = multiplier;
    conversionDivisor = divisor;
    return true;
}

event Swapped(address indexed user, uint256 firstAmount, uint256 secondAmount);
}
