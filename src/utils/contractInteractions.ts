import { type JsonRpcProvider, type Wallet, Contract } from 'ethers';
import { type Address } from 'viem'; // keep this type if you want, or use string
import { coreAbi, roomAbi } from '../types/contract.types';
import { BetType, RoundState } from '../types/roomTypes';

export class GameContracts {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private coreAddress: Address;

  constructor({
    provider,
    wallet,
    coreAddress,
  }: {
    provider: JsonRpcProvider;
    wallet: Wallet;
    coreAddress: Address;
  }) {
    this.provider = provider;
    this.wallet = wallet;
    this.coreAddress = coreAddress;
  }

  // Core Contract Functions
  async createRoom({
    gameMaster,
    creator,
    tokenAddress,
    roomAgentWallets,
    roomAgentFeeRecipients,
    roomAgentIds,
    roomImplementation,
  }: {
    gameMaster: Address;
    creator: Address;
    tokenAddress: Address;
    roomAgentWallets: Address[];
    roomAgentFeeRecipients: Address[];
    roomAgentIds: bigint[];
    roomImplementation: Address;
  }): Promise<string> {
    const contract = new Contract(this.coreAddress, coreAbi, this.wallet);
    const tx = await contract.createRoom(
      gameMaster,
      creator,
      tokenAddress,
      roomAgentWallets,
      roomAgentFeeRecipients,
      roomAgentIds,
      roomImplementation
    );
    await tx.wait();
    return tx.hash;
  }

  // Room Contract Functions
  async placeBet({
    roomAddress,
    agent,
    betType,
    amount,
  }: {
    roomAddress: Address;
    agent: Address;
    betType: BetType;
    amount: bigint;
  }): Promise<string> {
    const contract = new Contract(roomAddress, roomAbi, this.wallet);
    const tx = await contract.placeBet(agent, betType, amount);
    await tx.wait();
    return tx.hash;
  }

  async startRound({ roomAddress }: { roomAddress: Address }): Promise<string> {
    const contract = new Contract(roomAddress, roomAbi, this.wallet);
    const tx = await contract.startRound();
    await tx.wait();
    return tx.hash;
  }

  async getPvpStatuses({
    roomAddress,
    roundId,
    agent,
  }: {
    roomAddress: Address;
    roundId: bigint;
    agent: Address;
  }) {
    const contract = new Contract(roomAddress, roomAbi, this.provider);
    return await contract.getPvpStatuses(roundId, agent);
  }

  async setCurrentRoundState({
    roomAddress,
    newState,
  }: {
    roomAddress: Address;
    newState: RoundState;
  }): Promise<string> {
    const contract = new Contract(roomAddress, roomAbi, this.wallet);
    const tx = await contract.setCurrentRoundState(newState);
    await tx.wait();
    return tx.hash;
  }

  async invokePvpAction({
    roomAddress,
    target,
    verb,
    parameters,
  }: {
    roomAddress: Address;
    target: Address;
    verb: string;
    parameters: string;
  }): Promise<string> {
    const contract = new Contract(roomAddress, roomAbi, this.wallet);
    const tx = await contract.invokePvpAction(target, verb, parameters);
    await tx.wait();
    return tx.hash;
  }

  // Read-only functions
  async getCurrentRoundId(roomAddress: Address): Promise<bigint> {
    const contract = new Contract(roomAddress, roomAbi, this.provider);
    return await contract.currentRoundId();
  }

  async getRoundState(roomAddress: Address, roundId: bigint): Promise<RoundState> {
    const contract = new Contract(roomAddress, roomAbi, this.provider);
    return await contract.getRoundState(roundId);
  }
}

// Example usage:
/*
const gameContracts = new GameContracts({
  provider,
  wallet,
  coreAddress: '0x...',
})

// Create a room
const roomHash = await gameContracts.createRoom({
  gameMaster: '0x...',
  creator: '0x...',
  tokenAddress: '0x...',
  roomAgentWallets: ['0x...'],
  roomAgentFeeRecipients: ['0x...'],
  roomAgentIds: [1n],
  roomImplementation: '0x...',
})

// Place a bet
const betHash = await gameContracts.placeBet({
  roomAddress: '0x...',
  agent: '0x...',
  betType: BetType.Buy,
  amount: parseEther('1.0'),
})

// Start a round
const roundHash = await gameContracts.startRound({
  roomAddress: '0x...',
})
*/
