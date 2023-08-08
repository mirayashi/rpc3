export function batchResult1(
  nonce: number,
  count: number = 1
): { nonce: number; finalStateIpfsHash: string; responseIpfsHashes: Array<any> } {
  return {
    nonce,
    finalStateIpfsHash: "QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUW1",
    responseIpfsHashes: [...Array(count).keys()].map(() => ({
      ipfsHash: `QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUWk`
    }))
  }
}

export function batchResult2(
  nonce: number,
  count: number = 1
): { nonce: number; finalStateIpfsHash: string; responseIpfsHashes: Array<any> } {
  return {
    nonce,
    finalStateIpfsHash: "QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUW2",
    responseIpfsHashes: [...Array(count).keys()].map(() => ({
      ipfsHash: `QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUWk`
    }))
  }
}

export function batchResult3(
  nonce: number,
  count: number = 1
): { nonce: number; finalStateIpfsHash: string; responseIpfsHashes: Array<any> } {
  return {
    nonce,
    finalStateIpfsHash: "QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUW3",
    responseIpfsHashes: [...Array(count).keys()].map(() => ({
      ipfsHash: `QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUWk`
    }))
  }
}
