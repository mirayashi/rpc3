import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { deployPCU, deployPCUAndCreateKeys } from '../src/fixturesPCU'
import { utils } from 'rpc3-common'

describe('PrivateComputationUnit', () => {
  describe('Key creation', () => {
    it('Should create a new key', async () => {
      const { contract, owner } = await loadFixture(deployPCU)
      await expect(contract.keyExists(owner.address, 1)).to.eventually.be.false
      await expect(contract.createKey()).to.emit(contract, 'KeyCreated').withArgs(owner.address, 1, 0)
      await expect(contract.keyExists(owner.address, 1)).to.eventually.be.true
    })

    it('Should increment nonce for each key created, regardless of user', async () => {
      const {
        contract,
        owner,
        users: [user1, user2]
      } = await loadFixture(deployPCU)
      await expect(contract.createKey()).to.emit(contract, 'KeyCreated').withArgs(owner.address, 1, 0)
      await expect(contract.connect(user1).createKey()).to.emit(contract, 'KeyCreated').withArgs(user1.address, 2, 0)
      await expect(contract.connect(user2).createKey()).to.emit(contract, 'KeyCreated').withArgs(user2.address, 3, 0)
      await expect(contract.createKey()).to.emit(contract, 'KeyCreated').withArgs(owner.address, 4, 0)
    })

    it('Should create a shared key', async () => {
      const {
        contract,
        owner,
        users: [user1, user2]
      } = await loadFixture(deployPCU)
      await expect(contract.createSharedKey([user1.address, user2.address]))
        .to.emit(contract, 'KeyCreated')
        .withArgs(owner.address, 1, 2)
      await expect(contract.keyExists(owner.address, 1)).to.eventually.be.true
      await expect(contract.getAuthorizedAddresses(owner.address, 1)).to.eventually.have.members([
        user1.address,
        user2.address
      ])
    })

    it('Should ignore sender and duplicate addresses when creating a shared key', async () => {
      const {
        contract,
        owner,
        users: [user1, user2]
      } = await loadFixture(deployPCU)
      await expect(contract.createSharedKey([owner.address, user1.address, user2.address, user1.address]))
        .to.emit(contract, 'KeyCreated')
        .withArgs(owner.address, 1, 2)
      await expect(contract.keyExists(owner.address, 1)).to.eventually.be.true
      await expect(contract.getAuthorizedAddresses(owner.address, 1)).to.eventually.have.members([
        user1.address,
        user2.address
      ])
    })

    it('Should revert with KeyNotFound if key does not exist', async () => {
      const { contract, owner } = await loadFixture(deployPCU)

      const functions = [
        contract.getAuthorizedAddresses(owner.address, 1),
        contract.encrypt(1, Buffer.from('lol')),
        contract.decrypt(Buffer.concat([utils.hexString2Buf(owner.address), utils.bigInt2Buf32(1n)]))
      ]

      for (const f of functions) {
        await expect(f).to.be.revertedWithCustomError(contract, 'KeyNotFound')
      }
    })
  })

  describe('Encryption/decryption', () => {
    it('Should encrypt and decrypt a message with a simple key', async () => {
      const {
        contract,
        users: [user1],
        keyNonce
      } = await loadFixture(deployPCUAndCreateKeys)
      const plaintext = 'Hello world!'
      const ciphertext = utils.hexString2Buf(await contract.encrypt(keyNonce, Buffer.from(plaintext)))

      // Owner should be able to decrypt
      const backToPlaintext = utils.hexString2Buf(await contract.decrypt(ciphertext))
      expect(backToPlaintext.toString('utf8')).to.equal(plaintext)

      // Other users should NOT be able to decrypt
      await expect(contract.connect(user1).decrypt(ciphertext)).to.be.revertedWithCustomError(
        contract,
        'KeyUnauthorized'
      )
    })
    it('Should encrypt and decrypt a message with a shared key', async () => {
      const {
        contract,
        users: [user1, user2],
        sharedKeyNonce
      } = await loadFixture(deployPCUAndCreateKeys)
      const plaintext = 'Hello shared world!'
      const ciphertext = utils.hexString2Buf(await contract.encrypt(sharedKeyNonce, Buffer.from(plaintext)))

      // Owner should be able to decrypt
      const backToPlaintextOwner = utils.hexString2Buf(await contract.decrypt(ciphertext))
      expect(backToPlaintextOwner.toString('utf8')).to.equal(plaintext)

      // user1 should be able to decrypt
      const backToPlaintextUser1 = utils.hexString2Buf(await contract.connect(user1).decrypt(ciphertext))
      expect(backToPlaintextUser1.toString('utf8')).to.equal(plaintext)

      // user2 should NOT be able to decrypt
      await expect(contract.connect(user2).decrypt(ciphertext)).to.be.revertedWithCustomError(
        contract,
        'KeyUnauthorized'
      )
    })
  })

  describe('incrementCounter()', () => {
    it('Should increment the counter', async () => {
      const { contract, keyNonce } = await loadFixture(deployPCUAndCreateKeys)

      const counter = 1000n
      const increment = 123n

      const counterCiphertext = utils.hexString2Buf(await contract.encrypt(keyNonce, utils.bigInt2Buf32(counter)))
      const incrementCiphertext = utils.hexString2Buf(await contract.encrypt(keyNonce, utils.bigInt2Buf32(increment)))

      const resultCiphertext = utils.hexString2Buf(
        await contract.incrementCounter(counterCiphertext, incrementCiphertext)
      )
      const result = utils.buf322BigInt(utils.hexString2Buf(await contract.decrypt(resultCiphertext)))
      expect(result).to.equal(1123n)
    })
  })
})
