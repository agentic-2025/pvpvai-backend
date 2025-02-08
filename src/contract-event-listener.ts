// import { roundService } from '../services/roundService';
import { ethers } from 'ethers';
import { supabase } from './config';
import { roomAbi } from './types/contract.types';
import { PvpActionCategories, PvpActions } from './types/pvp';
import { WsMessageTypes } from './types/ws';
import {
  PvpAllPvpActionsType,
  attackActionSchema,
  deafenStatusSchema,
  poisonStatusSchema,
  silenceStatusSchema,
} from './utils/schemas';
import { wsOps } from './ws/operations';

import { Database } from './types/database.types';
console.log('Starting contract event listener');

// Base Sepolia RPC URL (Use Alchemy, Infura, or Public RPC)

// Error in createNewRound: Error: network does not support ENS (operation="getEnsAddress",

// Helper function to compute the hash of an indexed string
function getIndexedStringHash(str: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}

function hexToString(hex: string): string {
  // Remove '0x' prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  // Convert hex to buffer then to string
  return Buffer.from(cleanHex, 'hex').toString('utf8');
}

function decodeParameters(verb: string, parametersHex: string): any {
  try {
    const parametersStr = hexToString(parametersHex);
    const rawParameters = JSON.parse(parametersStr);

    // Convert scientific notation or large numbers to proper address format if it's a target
    if (rawParameters.target) {
      // Ensure target is treated as a hex string address
      rawParameters.target = ethers.getAddress(rawParameters.target.toString(16));
    }

    // Validate parameters based on verb type
    switch (verb.toUpperCase()) {
      case PvpActions.ATTACK:
        return attackActionSchema.shape.parameters.parse(rawParameters);
      case PvpActions.SILENCE:
        return silenceStatusSchema.shape.parameters.parse(rawParameters);
      case PvpActions.DEAFEN:
        return deafenStatusSchema.shape.parameters.parse(rawParameters);
      case PvpActions.POISON:
        return poisonStatusSchema.shape.parameters.parse(rawParameters);
      default:
        throw new Error(`Unknown verb type: ${verb}`);
    }
  } catch (error) {
    console.error('Error decoding parameters:', error);
    return null;
  }
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
    async (verbHash: any, address: string, endTime: number, parameters: any, event: any) => {
      console.log('\n=== PvpActionInvoked Event Details ===');

      // Decode the verb
      const verb = verbHashToString[verbHash.hash];
      if (!verb) {
        console.error('Unknown verb hash:', verbHash.hash);
        return;
      }

      // Decode the parameters
      const decodedParameters = decodeParameters(verb, parameters);
      if (!decodedParameters) {
        console.error('Failed to decode parameters');
        return;
      }

      // Create a structured object matching your schema types
      const pvpAction = {
        // @ts-ignore-next-line
        actionType: verb.toUpperCase() as PvpActions,
        actionCategory:
          verb === PvpActions.ATTACK
            ? PvpActionCategories.DIRECT_ACTION
            : PvpActionCategories.STATUS_EFFECT,
        parameters: decodedParameters,
      } satisfies PvpAllPvpActionsType;

      // Log the decoded data
      console.log('\nDecoded Data:');
      console.log('- Verb:', verb);
      console.log('- Address:', address);
      console.log('- End Time:', endTime);
      console.log('- Decoded Parameters:', decodedParameters);
      console.log('\nStructured PVP Action:', pvpAction);

      const pvpActionMessage = {
        messageType: WsMessageTypes.PVP_ACTION_ENACTED,
        sender: address,
        content: pvpAction,
      };

      const { data: round, error: roundError } = await supabase
        .from('rounds')
        .select('id')
        .eq('room_id', 15)
        .eq('status', 'OPEN')
        .single();

      if (roundError) {
        if (roundError.code === 'PGRST106') {
          console.error('No open round found for room 15, skipping pvp notification');
          return;
        }
        console.error('Error fetching round:', roundError);
        return;
      }

      await wsOps.broadcastToAiChat({
        roomId: 15,
        record: {
          agent_id: 57, //TODO hardcoding so bad, feels so bad, profound sadness, mama GM
          message: pvpActionMessage,
          round_id: round.id,
          message_type: WsMessageTypes.PVP_ACTION_ENACTED,
          original_author: null,
          pvp_status_effects: {}, // Our contract is the source of truth, this field is an artifact
        } satisfies Database['public']['Tables']['round_agent_messages']['Insert'],
      });
    }
  );
}
startContractEventListener();
