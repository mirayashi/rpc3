export function batchResult1(
  stateIpfsHash: string,
  author: any
): { initialStateIpfsHash: string; finalStateIpfsHash: string; responses: Array<any> } {
  return {
    initialStateIpfsHash: stateIpfsHash,
    finalStateIpfsHash: "finalFooBar2",
    responses: [
      {
        requestNonce: 1,
        ipfsHash: "response1",
        author
      }
    ]
  }
}

export function batchResult2(
  stateIpfsHash: string,
  author: any
): { initialStateIpfsHash: string; finalStateIpfsHash: string; responses: Array<any> } {
  return {
    initialStateIpfsHash: stateIpfsHash,
    finalStateIpfsHash: "finalFooBar3",
    responses: [
      {
        requestNonce: 1,
        ipfsHash: "response111110",
        author
      }
    ]
  }
}
