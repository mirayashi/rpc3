export function batchResult1(
  nonce: number,
  author: any
): { nonce: number; finalStateIpfsHash: string; responses: Array<any> } {
  return {
    nonce,
    finalStateIpfsHash: "finalFooBar1",
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
  nonce: number,
  author: any
): { nonce: number; finalStateIpfsHash: string; responses: Array<any> } {
  return {
    nonce,
    finalStateIpfsHash: "finalFooBar2",
    responses: [
      {
        requestNonce: 1,
        ipfsHash: "response111110",
        author
      }
    ]
  }
}

export function batchResult3(
  nonce: number,
  author: any
): { nonce: number; finalStateIpfsHash: string; responses: Array<any> } {
  return {
    nonce,
    finalStateIpfsHash: "finalFooBar3",
    responses: [
      {
        requestNonce: 1,
        ipfsHash: "responseZeub",
        author
      }
    ]
  }
}
