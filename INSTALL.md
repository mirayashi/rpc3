# Install Guide

This page will guide you step by step in setting up the project so you can run the counter demo app on your local
machine.

> **Unless specified otherwise, all commands must be run at the root directory of the project.**

## Prerequisites

- The project uses Node v18.17+ and NPM v9.8+. It should theoretically work on Node 20 as well, but I'm not sure whether
  Hardhat officially supports it.
- You need a local IPFS Kubo node running on your machine. You can find a tutorial
  [here](https://docs.ipfs.tech/install/command-line). Make sure you started your node with `ipfs daemon` and that the
  [RPC API](https://docs.ipfs.tech/reference/kubo/rpc) is accessible at http://127.0.0.1:5001
- You need PM2 installed globally:
  ```
  npm i -g pm2
  ```

## Install dependencies

After cloning the project, run this command at the root:

```sh
npm i
```

## Generate wallets

We will need 5 wallets with their address and private keys. You can run this script to easily generate 5 random wallets:

```sh
node walletGen.cjs
```

Now go to [Oasis Testnet Faucet](https://faucet.testnet.oasis.dev) and request Sapphire testnet tokens for each of the 5
wallet addresses. Make sure to save the private keys for the next step.

## Configure `.env` files

Copy and rename the following files:

- `sc/.env.template` => `sc/.env`
- `apps/counter-client-app/.env.template` => `apps/counter-client-app/.env`
- `apps/counter-server-app/.env.template` => `apps/counter-server-app/.env`

In `sc/.env`:

- Fill in the private key of **any wallet** in the `HH_PRIVATE_KEY` variable. It does not matter if it is reused for the
  client or the server. All it need is to have some testnet tokens funded in order to pay for contract deployment gas
  cost.

In `apps/counter-client-app/.env`:

- Fill in the private key of one of the 5 wallets you generated in the first step in the `WALLET_PRIVATE_KEY` variable.
  Leave the other variables empty for now, we will fill them in the next sections.

In `apps/counter-server-app/.env`:

- Fill in the private key of the remaining 4 wallets in all of the `WALLET_PRIVATE_KEY_X` variables. Leave the other
  variables empty for now, we will fill them in the next sections.

> Note: The `IPFS_RPC_URL` will be left empty as we will use the default localhost URL.

## Initialize the SQLite database file

Now we will initialize the application state for our counter app. Run:

```sh
npm -w apps/counter-server-app run db:init
```

You should get the following output:

```

> @rpc3/counter-server-app@1.0.0 db:init
> node dist/init.js

[TRACE] CREATE TABLE counter(addr PRIMARY KEY, count)
Initial database added to IPFS. IPFS CID: QmYsxsycgKTsch9GL3kSQ2sw6zX6JNoiRsz2i2fe28NzrF
```

> If you get an error **TypeError: fetch failed**, make sur your IPFS node is running and exposing the RPC API as per
> the prerequisites.

Save the IPFS CID for later, we will need it to deploy the contract.

## Run Hardhat unit tests (optional)

Before deploying contracts, it is always advisable to ensure unit tests pass correctly. You may use the following
command to launch Hardhat tests:

```sh
npm -w sc t
```

If you want to run a performance test in the end, use this command instead:

```sh
npm -w sc run test:perf
```

## Deploy the `RPC3` contract

It is now time to deploy our contract! Replace `<paste cid here>` with the CID you obtained when creating the database:

```sh
npm -w sc run deploy -- --state-cid <paste cid here>
```

Once successful, it should output the address of the contract. You can now add it to both your `.env` files under the
`CONTRACT_ADDRESS` variable.

> Make sure to update `.env` files for **both client and server**!

## Deploy the `PrivateComputationUnit` contract

This second contract will allow us to add end-to-end encryption so users can keep their counter private. Although it is
entirely decoupled from the first contract, its use is mandatory for the counter app to work. Run the following command:

```
npm -w sc run deploy:pcu
```

Paste the output contract address in `PCU_CONTRACT_ADDRESS` in **both** `.env` files.

## Run the app

For your convenience, I recommend you to open two terminals, one positioned in `apps/counter-client-app` and the other
one in `apps/counter-server-app`. In the server terminal, run the following:

```sh
npm run start:multi && pm2 logs
```

This will launch 4 servers, each with a different wallet. At the beginning, you will see transaction errors, don't
worry! Basically, all servers will try to register with 1 ROSE, but the first to be successful will double the stake
requirement for the others, so other 3 will fail. PM2 will restart them and they will retry to register, this time with
2 ROSE. One will succeed, the other two will fail, and so on. This demonstrates that the Sybil attack protection works
in a such way that many servers cannot register at once, the exponentially increasing staking requirement simply makes
mass registering impossible. The stake requirement decreases over time, in the manner of a Dutch auction, so legitimate
servers will be able to join later.

In the client terminal, now simply run `npm start`. You should be prompted to enter a number, choose one and press
Enter. Observe the servers working together to process your request, 40 seconds to one minute later, you should see your
response. The client app will exit, try `npm start` once more and observe how it retrieved the value of your counter.
Entering another value should add it to your previous total.

## Claiming server rewards

The `counter-server-app` comes with a few scripts that allow to manage your server.

If you want to claim your rewards from contributions, or withdraw your pending payments, run the following in the
`apps/counter-server-app` directory:

```sh
npm run claim
```

By default it runs the command for the **first server**, the one from the `WALLET_PRIVATE_KEY` env variable in your
`.env` file. You cannot directly use `WALLET_PRIVATE_KEY_2` for example, but you can still manually pass the env to the
command:

```sh
WALLET_PRIVATE_KEY="..." npm run claim
```

> If you see 0 ROSE from contributions even though your server has processed some commands, that's because the contract
> needs an external source of income to be able to distribute rewards. All you need to do is to manually send testnet
> tokens to the contract address.

## Unregistering a server

Want to unregister a server from the contract? Still in `apps/counter-server-app` directory, run:

```sh
npm run unregister
```

You then need to use `npm run claim` to withdraw the tokens you initially staked during registration.

> Unregistering slashes a certain % of the staked amount. This is to discourage servers from unregistering for the sole
> purpose of registering again at a time when the stake requirement is lower.
