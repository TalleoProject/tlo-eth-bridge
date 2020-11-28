// SPDX-License-Identifier: LGPL-2.0-or-later
pragma solidity >= 0.5.0 <0.7.6;

import "SafeMath.sol";
import "IERC20.sol";

contract WrappedTalleoToken is IERC20 {

using SafeMath for uint256;

string tokenName;
string tokenSymbol;
uint8 public decimals;
address payable owner;
uint256 tokenTotalSupply;
mapping(address => uint256) balances;
mapping(address => mapping(address => uint256)) allowed;

modifier onlyOwner() {
    require(msg.sender == owner, "Only owner can call this function.");
    _;
}

constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _totalSupply) {
    owner = msg.sender;
    tokenName = _name;
    tokenSymbol = _symbol;
    decimals = _decimals;
    tokenTotalSupply = _totalSupply;
    balances[owner] = _totalSupply;
    emit Transfer(address(0), owner, _totalSupply);
}

function name() public view returns (string memory) {
    return tokenName;
}

function symbol() public view returns (string memory) {
    return tokenSymbol;
}

function totalSupply() public override view returns (uint256) {
    return tokenTotalSupply;
}

function balanceOf(address _owner) public override view returns (uint256) {
    return balances[_owner];
}

function transfer(address recipient, uint256 amount) public override returns (bool) {
    require(balances[msg.sender] >= amount);

    balances[msg.sender] = balances[msg.sender].sub(amount);
    balances[recipient] = balances[recipient].add(amount);

    emit Transfer(msg.sender, recipient, amount);
    return true;
}

function allowance(address sender, address spender) public override view returns (uint256) {
    return allowed[sender][spender];
}

function approve(address spender, uint256 amount) external override returns (bool) {
    require(balances[msg.sender] >= amount);

    allowed[msg.sender][spender] = amount;
    emit Approval(msg.sender, spender, amount);
    return true;
}

function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
    require(allowed[sender][msg.sender] >= amount);
    require(balances[sender] >= amount);

    allowed[sender][msg.sender] = allowed[sender][msg.sender].sub(amount);
    balances[sender] = balances[sender].sub(amount);
    balances[recipient] = balances[recipient].add(amount);
    emit Transfer(sender, recipient, amount);
    return true;
}

receive() external payable {
    emit Received(msg.sender, msg.value);
}

function withdrawETH() public onlyOwner returns (bool) {
    require(address(this).balance > 0);
    owner.transfer(address(this).balance);
    return true;
}

function withdrawETH(uint256 amount) public onlyOwner returns (bool) {
    require(address(this).balance >= amount);
    require(amount > 0);
    owner.transfer(amount);
    return true;
}

function sendETH(address payable recipient, uint256 amount) public onlyOwner returns (bool) {
    require(address(this).balance >= amount);
    require(amount > 0);
    recipient.transfer(amount);
    return true;
}

function Selfdestructs() public onlyOwner {
    selfdestruct(owner);
}

function convertTo(bytes memory recipient, uint256 amount) public returns (bool) {
    require(recipient.length == 71);
    require(balances[msg.sender] >= amount);

    balances[msg.sender] = balances[msg.sender].sub(amount);
    balances[owner] = balances[owner].add(amount);
    emit ConversionTo(msg.sender, recipient, amount);
    emit Transfer(msg.sender, owner, amount);
    return true;
}

function convertTo(address sender, bytes memory recipient, uint256 amount) public onlyOwner returns (bool) {
    require(recipient.length == 71);
    require(balances[sender] >= amount);

    balances[sender] = balances[sender].sub(amount);
    balances[owner] = balances[owner].add(amount);
    emit ConversionTo(sender, recipient, amount);
    emit Transfer(msg.sender, owner, amount);
    return true;
}

function convertFrom(bytes memory sender, address recipient, uint256 amount) public onlyOwner returns (bool) {
    require(sender.length == 71);
    require(balances[owner] >= amount);

    balances[owner] = balances[owner].sub(amount);
    balances[recipient] = balances[recipient].add(amount);
    emit ConversionFrom(sender, recipient, amount);
    emit Transfer(owner, recipient, amount);
    return true;
}

event Received(address indexed from, uint256 value);

event ConversionTo(address indexed from, bytes to, uint256 value);

event ConversionFrom(bytes from, address indexed to, uint256 value);
}
