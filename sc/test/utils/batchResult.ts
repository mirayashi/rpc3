export function batchResult1(
  nonce: number,
  author: any,
  count: number = 1
): { nonce: number; finalStateIpfsHash: string; responses: Array<any> } {
  return {
    nonce,
    finalStateIpfsHash: "QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUW1",
    responses: [...Array(count).keys()].map(() => ({
      ipfsHash: `QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUWk`,
      author
    }))
  }
}

export function batchResult2(
  nonce: number,
  author: any,
  count: number = 1
): { nonce: number; finalStateIpfsHash: string; responses: Array<any> } {
  return {
    nonce,
    finalStateIpfsHash: "QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUW2",
    responses: [...Array(count).keys()].map(() => ({
      ipfsHash: `QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUWk`,
      author
    }))
  }
}

export function batchResult3(
  nonce: number,
  author: any,
  count: number = 1
): { nonce: number; finalStateIpfsHash: string; responses: Array<any> } {
  return {
    nonce,
    finalStateIpfsHash: "QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUW3",
    responses: [...Array(count).keys()].map(() => ({
      ipfsHash: `QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUWk`,
      author
    }))
  }
}
