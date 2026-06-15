import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const Accountability = await ethers.getContractFactory("Accountability");
  const contract = await Accountability.deploy();
  await contract.waitForDeployment();

  console.log("Accountability deployed to:", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});