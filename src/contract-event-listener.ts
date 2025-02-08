// import { roundService } from '../services/roundService';
import { ethers } from 'ethers';
import { roomAbi } from './types/contract.types';

console.log('Starting contract event listener');

// Base Sepolia RPC URL (Use Alchemy, Infura, or Public RPC)

// Error in createNewRound: Error: network does not support ENS (operation="getEnsAddress",

// Helper function to compute the hash of an indexed string
function getIndexedStringHash(str: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}

export function startContractEventListener() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);

  // Your deployed contract address
  const contractAddress = '0x9Bd805b04809AeE006Eb05572AAFB2807A03eCDb';

  // Create contract instance
  const contract = new ethers.Contract(contractAddress, roomAbi, provider);

  console.log('Starting contract event listener');

  // Create mapping of all possible verb hashes
  const verbHashToString: Record<string, string> = {
    [getIndexedStringHash('attack')]: 'attack',
    [getIndexedStringHash('silence')]: 'silence',
    [getIndexedStringHash('deafen')]: 'deafen',
    [getIndexedStringHash('poison')]: 'poison',
  };

  contract.on(
    'PvpActionInvoked',
    (verbHash: any, address: string, endTime: number, parameters: any, event: any) => {
      console.log('\n=== PvpActionInvoked Event Details ===');

      // Log the decoded parameters
      console.log('\nDecoded Parameters:');
      console.log('- Verb Hash:', verbHash.hash);
      const verb = verbHashToString[verbHash.hash];
      console.log('- Verb: ', verb);
      console.log('- Address:', address);
      console.log('- End Time:', endTime);
      console.log('- Parameters:', parameters);

      // Log the raw event data
      console.log('\nRaw Event Data:');
      console.log('- Block Number:', event.blockNumber);
      console.log('- Transaction Hash:', event.transactionHash);
      console.log('- Block Hash:', event.blockHash);
      console.log('- Log Index:', event.logIndex);
      console.log('- Event Name:', event.eventName);
      console.log('- Topics:', event.topics);
      console.log('- Data:', event.data);

      // If you want to see the entire event object
      console.log('\nComplete Event Object:');
      console.log(JSON.stringify(event, null, 2));

      // If there are any args in event.args, log them
      if (event.args) {
        console.log('\nEvent Arguments:');
        for (let i = 0; i < event.args.length; i++) {
          console.log(`Arg ${i}:`, event.args[i]?.toString());
        }
      }
    }
  );
}
startContractEventListener();
