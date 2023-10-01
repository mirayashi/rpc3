# RPC3

A _Proof-of-Concept_ for decentralized remote procedure calls, leveraging IPFS and privacy-enabled blockchain

## Inspiration

This project aims at providing an alternate solution to the classic and widely used client-server architecture when it
comes to consuming remote services. This architecture works well when the service in question is managed by a central
organization, because it is straightforward, cheap and simple to understand:

![classic architecture](docs/architecture-classic.png)

But if we want a service that is entirely autonomous and decentralized, we need to imagine a new architecture where the
client doesn't interact with a server, but with a network of computers that work together and reach consensus about the results.

First thing that comes to mind when hearing this definition is blockchain technology. Indeed, blockchain provides a great part
of the solution, especially smart contracts which allowed the surge of decentralized exchanges and other DApps. But this
comes with a certain number of limitations :

- Computational resources of smart contracts are limited, whether it is CPU power, memory or disk storage. EVM chains
  for example use a gas system as a way to monetize these resources, and capacity depends on the maximum size of blocks
  which is very limited
- Programming of smart contracts can only be done with a limited set of instructions. Because result needs to be
  deterministic, we cannot use regular server-side programming languages, frameworks and libraries. We need to rely
  on oracles and inter-chain communication protocols to get data from external world, which adds layers of complexity.
- Deploying updates is a tough task as smart contracts are by design not upgradeable. Design patterns exist in order to
  mitigate this limitation, like the proxy pattern, but some cases may require more complex migration logic which
  execution is a critical process and inherently induces various risks.

When I discovered [Oasis Protocol](https://oasisprotocol.org) and how they managed to add privacy on smart contracts, I
immediately realized that it would unlock new use cases and solve problems that did not have a solution until now.
Regarding the three points above, there are indeed some projects out there that aim at solving one or many of these
problems, but they often imply the creation of a new protocol or a new blockchain from scratch. However, I was able to
glimpse the possibility of a solution that only uses smart contracts on an already existing protocol by leveraging the
privacy capabilities.

This is how the RPC3 project is born. I gave it this name because the type of client-server interactions that I wanted to
cover matches pretty well the definition of [Remote Procedure
Calls](https://en.wikipedia.org/wiki/Remote_procedure_call), and the "3" is a reference to
[web3](https://fr.wikipedia.org/wiki/Web3) as the solution relies on web3 technologies.

## Overview

We obviously cannot expect such a new architecture to be as simple and straightforward as the classic one, simply
because of the number of technical challenges being inherently higher. Some balance must be found between complexity and
feasibility, the initial brainstorming is certainly what took the most time, especially when you are working solo on it.
Here is what it looks like in the end:

![RPC3 architecture](docs/architecture-rpc3.png)

Let's break this down:

- The general concept is that instead of one central server, we have **many servers** operated by **independant** individuals or
  organizations. All of these servers run the **same** application code, written **with the usual programming languages**,
  frameworks and libraries. The smart contract acts as a **coordinator** between all of these servers, while **data
  storage and transmission** is done via IPFS (request and response payloads + application state)
- When the client wants to send a command, it **uploads** the payload (opcode, parameters, etc) of the command to IPFS,
  then **submits** the CID (IPFS hash-based content identifier) to the smart contract
- Servers are **notified** of incoming commands from the contract, they will **download** the content from IPFS and
  **execute** the command on their local environment
- Each server write the **command output** and the **new application state** to IPFS, and **submits** both resulting CIDs back to
  the contract
- The contract determines whether a **consensus has been reached** by comparing results between servers
- The client is notified that a **response is available**, from there they can get the CID and download the content from IPFS

