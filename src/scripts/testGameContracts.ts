import { config } from 'dotenv';
import { JsonRpcProvider, Wallet } from 'ethers';
import { type Address } from 'viem'; // keep this type if you want, or use string
import { GameContracts } from '../lib/contractInteractions';
import { RoundState } from '../types/roomTypes';

// Load environment variables
config();

async function main() {
  // Get private key from env
  const privateKey = process.env.SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('SIGNER_PRIVATE_KEY not found in environment variables');
  }

  // Get core contract address and ensure it's a valid address
  const coreAddress = process.env.APPLICATION_CONTRACT_ADDRESS as Address;
  if (!coreAddress) {
    throw new Error('APPLICATION_CONTRACT_ADDRESS not found in environment variables');
  }

  // Initialize provider and wallet
  const provider = new JsonRpcProvider(
    process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'
  );
  const wallet = new Wallet(privateKey, provider);

  console.log('wallet address:', wallet.address);

  // Initialize GameContracts
  const gameContracts = new GameContracts({
    provider,
    wallet,
    coreAddress,
  });

  try {
    const roomAddress = '0x822543BE8732D116821bD51eCa7616F6b3bD5575' as Address;

    // Get current state
    const currentRound = await gameContracts.getCurrentRoundId(roomAddress);
    console.log('Current round:', currentRound);

    let roundState = await gameContracts.getRoundState(roomAddress, currentRound);
    console.log('Initial round state:', roundState);

    // Set round to Closed
    console.log('Setting round to Closed...');
    const closeHash = await gameContracts.setCurrentRoundState({
      roomAddress,
      newState: RoundState.Closed,
    });
    console.log('Close transaction hash:', closeHash);
    await provider.waitForTransaction(closeHash);

    // Check new state
    roundState = await gameContracts.getRoundState(roomAddress, currentRound);
    console.log('Round state after closing:', roundState);

    // Set round back to Active
    console.log('Setting round back to Active...');
    const activeHash = await gameContracts.setCurrentRoundState({
      roomAddress,
      newState: RoundState.Active,
    });
    console.log('Active transaction hash:', activeHash);
    await provider.waitForTransaction(activeHash);

    // Check final state
    roundState = await gameContracts.getRoundState(roomAddress, currentRound);
    console.log('Final round state:', roundState);
  } catch (error) {
    console.error('Error:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
}

// Run the test
main().catch((error) => {
  console.error('Top level error:', error);
  process.exit(1);
});
