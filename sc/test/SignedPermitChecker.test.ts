import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { utils } from '@rpc3/common'

describe('SignedPermitChecker', () => {
  async function deploy() {
    const [owner, ...users] = await ethers.getSigners()

    const SignedPermitChecker = await ethers.getContractFactory('SignedPermitCheckerTest')
    const contract = await SignedPermitChecker.deploy()

    return { contract, owner, users }
  }

  const ttl = 3600
  const types = {
    CipheredPermit: [
      { name: 'nonce', type: 'uint256' },
      { name: 'ciphertext', type: 'bytes' }
    ]
  }

  it('Should be permitted to call foo method', async () => {
    const { contract, owner } = await loadFixture(deploy)
    const cipheredPermit = await contract.requestPermit(owner.address, 0, ttl)
    const signature = await owner._signTypedData(
      utils.toTypedDataDomain(await contract.eip712Domain()),
      types,
      cipheredPermit
    )
    await expect(contract.foo({ cipheredPermit, signature })).to.eventually.be.true
  })

  it('Should revert with PermitUnauthorized if signature is invalid', async () => {
    const {
      contract,
      owner,
      users: [user1]
    } = await loadFixture(deploy)
    const cipheredPermit = await contract.requestPermit(owner.address, 0, ttl)
    // user1 signs instead of owner
    const invalidSignature = await user1._signTypedData(
      utils.toTypedDataDomain(await contract.eip712Domain()),
      types,
      cipheredPermit
    )
    await expect(contract.foo({ cipheredPermit, signature: invalidSignature })).to.be.revertedWithCustomError(
      contract,
      'PermitUnauthorized'
    )
  })

  it('Should revert with PermitExpired if using a permit past expiry', async () => {
    const { contract, owner } = await loadFixture(deploy)
    const cipheredPermit = await contract.requestPermit(owner.address, 0, ttl)
    // user1 signs instead of owner
    const signature = await owner._signTypedData(
      utils.toTypedDataDomain(await contract.eip712Domain()),
      types,
      cipheredPermit
    )
    await time.increase(ttl + 1)
    await expect(contract.foo({ cipheredPermit, signature })).to.be.revertedWithCustomError(contract, 'PermitExpired')
  })

  it('Should revert with TtlTooBig if requesting a permit with too big ttl', async () => {
    const { contract, owner } = await loadFixture(deploy)
    await expect(contract.requestPermit(owner.address, 0, 999999)).to.be.revertedWithCustomError(contract, 'TtlTooBig')
  })
})
