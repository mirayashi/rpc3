# RPC3

A _Proof-of-Concept_ for decentralized remote procedure calls, leveraging IPFS and privacy-enabled blockchain.

## Overview

RPC3 is not a protocol, but rather a standard that suggests a novel architecture for decentralized autonomous
applications. IPFS and blockchain are both technologies enabling decentralization on the web, one for data storage and
transmission, the other for consensus in code execution and exchange of value. The idea behind RPC3 is to leverage the
best of both technologies in order to allow building multi-purpose and arbitrarily complex applications and online
services that are truly owned and governed by their users. It basically works by storing application state and request
payload data to IPFS before submitting their CID to a smart contract, which acts as a coordinator and decides the order
in which requests are processed. Then anyone who has some computing resources and is willing to stake some value in the
contract is able to collect the requests and execute them in their local environment, submitting the IPFS CIDs of the
outputs of each request as well as the final state of the application back to the contract. The response is then
delivered to the caller and rewards are distributed to network participants, if and only if the contract determines that
a consensus has been established in the results. As it doesn’t enforce any implementation details, apps built on top of
RPC3 principles are free to add extra layers in order to achieve other goals, such as data privacy or integration with
APIs of the web as we know today.

Read the full whitepaper [here](https://rpc3.mirayashi.me/RPC3.pdf).

## Scope and project contents

This repository contains:

- A smart contract written in Solidity for the Sapphire EVM paratime that has the following features:
  - Register and unregister servers with a Dutch auction-styled staking mechanism that offers protection against Sybil
    attacks
  - Accept requests from clients and organize them in batches to improve scalability and keep down gas costs
  - A basic consensus algorithm to compare results between servers, with customizable quorum and ratio thresholds
  - Housekeeping mechanism to filter out inactive servers from the consensus process
  - Basic reward mechanism to incentivize servers to contribute positively, without explicitly defining the source of
    income that fund these rewards
- A rudimentary demo app that allows clients to increment a private counter:
  - A command-line client app that connects to a local IPFS node and can interact with the contract. The users chooses a
    number and will increment a counter by that number, that initially starts at 0
  - A server app that connects to the same local IPFS node and includes scripts to launch many servers and simulate the
    consensus process
  - The off-chain state of the application (in this case, the counter values for each user) is a SQLite database file
    living on IPFS. Clients may download it to retrieve the value of their counter, and servers use it to update its
    contents
- A "private computation unit" (PCU) smart contract that adds an encryption layer to the whole system. This contract is
  entirely decoupled from the system itself. It basically makes it possible for clients to send encrypted requests and
  for servers to perform computations over private data, before sending the encrypted response back to the client while
  keeping the application state encrypted as well. The counter demo app leverages that in order to keep the counters
  private to the users owning them (one user cannot see the value of another user's counter, and servers have no
  knowledge of the values being computed).

## Installation guide

If you want to check out this project on your machine, you can find the full installation guide [here](./INSTALL.md).

## Limitations and disclaimers

- Although I made the effort to properly unit-test all of my smart contracts, the code of the demo applications is
  essentially untested and is prone to bugs.
- The system has not been tested at a large scale. There probably are limitations that can only be observed in
  real-world conditions that I may have missed. For example, when I played around with IPFS, I noticed that newly
  uploaded data may take some time to propagate from one node to another. I'm not sure how problematic that could be in
  the context of this project, and I didn't have the opportunity to evaluate the impact yet.
- Currently you need to manually send funds to the contract in order to reward servers for their contribution. This is
  good because it allows to define the app's business model in a decoupled way, but this part is not covered in the demo
  counter app.
- The consensus process takes a certain time to complete. Between the submission of the command and the availability of
  the output, there is an observed minimum of 40 seconds of delay. As mentioned in the paper, the scope is limited to
  _fast read, slow write_ type of applications.

## Challenges

Working on this project was of course extremely challenging for me. While I do have a solid programming background in
Node.js and that I've been working as a software engineer for 2 years, it was my first time coding in Solidity. I made
progression in this project in a learning-by-doing fashion; but Solidity being a very simple language with familiar
syntax, learning the language itself wasn't an issue for me. Most of the work was about mastering the different kind of
data location (storage, memory, calldata), and how the different instructions affect the gas costs and how to optimize
them.

An essential aspect that I've got to learn was security of smart contracts. I documented myself about reentrancy
attacks, how to implement reentrancy guards and pull payments using openzeppelin solutions, and how to implement EIP712
permits in order to authenticate view calls. I even managed to design a EIP712 implementation that is 100% gasless by
leveraging Sapphire encryption!

The last challenge was to think about all of the edge cases inherent to the complexity of the system I designed. How to
code a proper staking mechanism, how to code a proper consensus algorithm, how to handle cases where servers go
inactive, what to do when clients submit invalid data... But in the end, I had fun and I'm happy with the result :)

## What's next ?

My dream would be to become the creator of an application that would entirely be run by its users, just like what
Satoshi managed to achieve with Bitcoin. It is not a coincidence that Mirayashi sounds like Satoshi...

With this project I hope to lay the foundation for decentralized applications with real-world use cases that go way
beyond the exchange of digital assets. By "real-world use cases", I mean social platforms, calendars, cloud services,
messaging apps, word and image processing, or even games. If you look at the dApps that perform well as of today, they
are for most of them centered on the exchange of financial value (DEX, lending, NFT marketplaces...). But the reason why
we still barely have any popular dApp that cover the most everyday use cases, like the ones I just enumerated, I'm
convinced that the various limitations and the difficult integration with the web2 world that I exposed in the paper
play a significant role. And I'm proud to present this _Proof-of-Concept_ to show the world that an alternative might
actually be possible.

The next steps for me would be to acquire constructive feedback in order to determine which aspects can be improved
design-wise. I would then work on refining the implementation by writing modules and libraries to help other developers
design their first RPC3-based app. And maybe, who knows, I will make my own one as well, that one app that could
potentially allow me to achieve my dream.
