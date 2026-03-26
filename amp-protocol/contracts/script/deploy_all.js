require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "xDAI");

  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const arbitrator = process.env.ARBITRATOR_ADDRESS || deployer.address;

  console.log("\n1. Deploying ListingRegistry...");
  const ListingRegistry = await ethers.getContractFactory("ListingRegistry");
  const registry = await ListingRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("   ListingRegistry:", registryAddress);

  console.log("\n2. Deploying AMPEscrow...");
  const AMPEscrow = await ethers.getContractFactory("AMPEscrow");
  const escrow = await AMPEscrow.deploy(treasury, arbitrator);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("   AMPEscrow:", escrowAddress);

  console.log("\n3. Deploying ReputationLedger...");
  const ReputationLedger = await ethers.getContractFactory("ReputationLedger");
  const reputation = await ReputationLedger.deploy();
  await reputation.waitForDeployment();
  const reputationAddress = await reputation.getAddress();
  console.log("   ReputationLedger:", reputationAddress);

  console.log("\n4. Linking ReputationLedger to Escrow...");
  const linkTx = await reputation.setEscrowContract(escrowAddress);
  await linkTx.wait();
  console.log("   Done.");

  const network = await ethers.provider.getNetwork();
  const addresses = {
    network: network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    treasury,
    arbitrator,
    contracts: {
      ListingRegistry: registryAddress,
      AMPEscrow: escrowAddress,
      ReputationLedger: reputationAddress,
    },
  };

  const outPath = path.join(__dirname, "../deploy/addresses.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log("\nAddresses saved to:", outPath);
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
