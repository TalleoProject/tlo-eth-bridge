// SPDX-License-Identifier: LGPL-2.0-or-later
pragma solidity >= 0.8.0 <0.9.0;

import "IERC20.sol";

contract WrappedTalleoToken is IERC20 {

string tokenName;
string tokenSymbol;
uint8 tokenDecimals;
address payable owner;
uint256 tokenTotalSupply;
mapping(address => uint256) balances;
mapping(address => mapping(address => uint256)) allowed;

modifier onlyOwner() {
    require(msg.sender == owner, "Only owner can call this function.");
    _;
}

constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _totalSupply) {
    owner = payable(msg.sender);
    tokenName = _name;
    tokenSymbol = _symbol;
    tokenDecimals = _decimals;
    tokenTotalSupply = _totalSupply;
    balances[owner] = _totalSupply;
    emit Transfer(address(0), owner, _totalSupply);
}

function getOwner() public view returns (address) {
    return owner;
}

function name() public override view returns (string memory) {
    return tokenName;
}

function symbol() public override view returns (string memory) {
    return tokenSymbol;
}

function decimals() public override view returns (uint8) {
    return tokenDecimals;
}

function totalSupply() public override view returns (uint256) {
    return tokenTotalSupply;
}

function circulatingSupply() public view returns (uint256) {
    return tokenTotalSupply - balances[owner] - balances[address(this)] - balances[address(0)];
}

function balanceOf(address _owner) public override view returns (uint256) {
    return balances[_owner];
}

function _transfer(address _from, address _to, uint256 _value) internal {
    require(balances[_from] >= _value);

    balances[_from] -= _value;
    balances[_to] += _value;

    emit Transfer(_from, _to, _value);
}

function transfer(address _to, uint256 _value) public override returns (bool) {
    _transfer(msg.sender, _to, _value);
    return true;
}

function allowance(address _owner, address _spender) public override view returns (uint256) {
    return allowed[_owner][_spender];
}

function increaseAllowance(address _spender, uint256 _addedValue) public returns (bool) {
    uint256 _value = allowed[msg.sender][_spender] + _addedValue;
    _approve(msg.sender, _spender, _value);
    return true;
}

function decreaseAllowance(address _spender, uint256 _subtractedValue) public returns (bool) {
    uint256 _value = allowed[msg.sender][_spender] - _subtractedValue;
    _approve(msg.sender, _spender, _value);
    return true;
}

function _approve(address _owner, address _spender, uint256 _value) internal {
    require(_owner != address(0));
    require(_spender != address(0));
    require(balances[_owner] >= _value);

    allowed[_owner][_spender] = _value;
    emit Approval(_owner, _spender, _value);
}

function approve(address _spender, uint256 _value) public override returns (bool) {
    _approve(msg.sender, _spender, _value);
    return true;
}

function transferFrom(address _from, address _to, uint256 _value) public override returns (bool) {
    require(allowed[_from][msg.sender] >= _value);
    _transfer(_from, _to, _value);
    allowed[_from][msg.sender] -= _value;
    return true;
}

receive() external payable {
    emit Received(msg.sender, msg.value);
}

function withdrawERC20(uint256 _value) public onlyOwner returns (bool) {
    address myAddress = address(this);
    _transfer(myAddress, msg.sender, _value);
    return true;
}

function withdrawERC20(IERC20 _token, uint256 _value) public onlyOwner returns (bool) {
    return _token.transfer(msg.sender, _value);
}

function withdrawETH() public onlyOwner returns (bool) {
    require(address(this).balance > 0);
    owner.transfer(address(this).balance);
    return true;
}

function withdrawETH(uint256 _value) public onlyOwner returns (bool) {
    require(address(this).balance >= _value);
    require(_value > 0);
    owner.transfer(_value);
    return true;
}

function sendETH(address payable _to, uint256 _value) public onlyOwner returns (bool) {
    require(address(this).balance >= _value);
    require(_value > 0);
    _to.transfer(_value);
    return true;
}

function sendERC20(IERC20 _token, address _to, uint256 _value) public onlyOwner returns (bool) {
    return _token.transfer(_to, _value);
}

function convertTo(bytes memory _to, uint256 _value) public returns (bool) {
    require(_to.length == 71);
    _transfer(msg.sender, owner, _value);
    emit ConversionTo(msg.sender, _to, _value);
    return true;
}

function convertTo(address _from, bytes memory _to, uint256 _value) public onlyOwner returns (bool) {
    require(_to.length == 71);
    _transfer(_from, owner, _value);
    emit ConversionTo(_from, _to, _value);
    return true;
}

function convertFrom(bytes memory _from, address _to, uint256 _value) public onlyOwner returns (bool) {
    require(_from.length == 71);
    _transfer(owner, _to, _value);
    emit ConversionFrom(_from, _to, _value);
    return true;
}

event Received(address indexed _from, uint256 _value);

event ConversionTo(address indexed _from, bytes _to, uint256 _value);

event ConversionFrom(bytes _from, address indexed _to, uint256 _value);
}
