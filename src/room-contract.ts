import { ethers } from 'ethers';
import { roomAbi } from './types/contract.types';

export function getRoomContract(contractAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  return new ethers.Contract(contractAddress, roomAbi, wallet);
}
