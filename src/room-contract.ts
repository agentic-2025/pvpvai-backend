import { ethers } from 'ethers';
import { ROOM_ABI } from './abi/Room';  // You'll need to create this

export function getRoomContract(contractAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  return new ethers.Contract(contractAddress, ROOM_ABI['abi'], wallet);
}
