// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

library StakeLib {
    // Decrease by 50% every 1 week
    uint constant ONE_WEEK = 604800;
    // Set to minAmount after 1 year
    uint constant ONE_YEAR = 31536000;

    struct Stake {
        uint minAmount;
        uint baseAmount;
        uint lastStakedAt;
    }

    function tryStake(Stake storage self) public returns (bool) {
        uint amount = calculateAmount(self);
        if (msg.value < amount) {
            return false;
        }
        self.baseAmount = amount << 1;
        self.lastStakedAt = block.timestamp;
        return true;
    }

    function calculateAmount(Stake storage self) public view returns (uint) {
        if (self.baseAmount == 0) {
            return self.minAmount;
        }
        uint elapsed = block.timestamp - self.lastStakedAt;
        if (elapsed > ONE_YEAR) {
            return self.minAmount;
        }
        uint periods100 = (elapsed * 100) / ONE_WEEK;
        uint periods = periods100 / 100;
        uint periodRest = periods100 % 100;
        uint newAmount = self.baseAmount >> periods;
        newAmount -= ((newAmount - (newAmount >> 1)) * periodRest) / 100;
        return Math.max(newAmount, self.minAmount);
    }
}
