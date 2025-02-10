// import { roundService } from '../services/roundService';
import { ethers } from 'ethers';
import { z } from 'zod';
import { supabase, wsOps } from './config';
import { roomAbi } from './types/contract.types';
import { Database } from './types/database.types';
import { PvpActionCategories, PvpActions } from './types/pvp';
import { WsMessageTypes } from './types/ws';
import {
  PvpAllPvpActionsType,
  attackActionSchema,
  deafenStatusSchema,
  poisonStatusSchema,
  pvpActionEnactedAiChatOutputSchema,
  silenceStatusSchema,
} from './utils/schemas';

const HARDCODED_ROOM = 16;
const HARDCODED_ROOM_ADDRESS = '0x1698f764C1d34315698D9D96Ded939e24587a3fB';

// Base Sepolia RPC URL (Use Alchemy, Infura, or Public RPC)

// Error in createNewRound: Error: network does not support ENS (operation="getEnsAddress",
export function getRoomContract(contractAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  return new ethers.Contract(contractAddress, roomAbi, wallet);
}

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

function decodePvpInvokeParameters(verb: string, parametersHex: string): any {
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

function getPvpActionFromVerb(verb: string, decodedParameters: any): PvpAllPvpActionsType {
  switch (verb.toUpperCase()) {
    case PvpActions.ATTACK:
      return {
        actionType: PvpActions.ATTACK,
        actionCategory: PvpActionCategories.DIRECT_ACTION,
        parameters: {
          target: decodedParameters.target,
          message: decodedParameters.message,
        },
      };
    case PvpActions.SILENCE:
      return {
        actionType: PvpActions.SILENCE,
        actionCategory: PvpActionCategories.STATUS_EFFECT,
        parameters: {
          target: decodedParameters.target,
          duration: decodedParameters.duration,
        },
      };
    case PvpActions.DEAFEN:
      return {
        actionType: PvpActions.DEAFEN,
        actionCategory: PvpActionCategories.STATUS_EFFECT,
        parameters: {
          target: decodedParameters.target,
          duration: decodedParameters.duration,
        },
      };
    case PvpActions.POISON:
      return {
        actionType: PvpActions.POISON,
        actionCategory: PvpActionCategories.STATUS_EFFECT,
        parameters: {
          target: decodedParameters.target,
          duration: decodedParameters.duration,
          find: decodedParameters.find,
          replace: decodedParameters.replace,
          case_sensitive: decodedParameters.case_sensitive,
        },
      };
    default:
      throw new Error(`Unsupported PVP action: ${verb}`);
  }
}

function logAvailableEvents(abi: any[]) {
  const events = abi.filter((item) => item.type === 'event');
  console.log('\nAvailable events in contract:');
  events.forEach((event) => {
    console.log(`- ${event.name}`);
    console.log('  Parameters:', event.inputs);
  });
}

export async function startContractEventListener() {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);

    // Add reconnection logic
    // provider.on('disconnect', async (error) => {
    //   console.log('Provider disconnected:', error);
    //   try {
    //     await provider.destroy();
    //     // Wait a bit before reconnecting
    //     await new Promise((resolve) => setTimeout(resolve, 5000));
    //     await startContractEventListener();
    //   } catch (reconnectError) {
    //     console.error('Failed to reconnect:', reconnectError);
    //   }
    // });

    // Verify provider connection
    const network = await provider.getNetwork();
    console.log('Connected to network:', network.name, 'chainId:', network.chainId);

    const contractAddress = HARDCODED_ROOM_ADDRESS;
    const contract = new ethers.Contract(contractAddress, roomAbi, provider);

    // Verify contract connection
    const code = await provider.getCode(contractAddress);
    if (code === '0x') {
      throw new Error('No contract found at address: ' + contractAddress);
    }

    console.log(
      'Starting contract event listener on room #',
      HARDCODED_ROOM,
      'with address',
      contractAddress
    );

    // Create mapping of all possible verb hashes
    const verbHashToString: Record<string, string> = {
      [getIndexedStringHash('attack')]: 'attack',
      [getIndexedStringHash('silence')]: 'silence',
      [getIndexedStringHash('deafen')]: 'deafen',
      [getIndexedStringHash('poison')]: 'poison',
    };

    // Set up event filters
    const roundStartedFilter = contract.filters.RoundStarted();
    const roundStateUpdatedFilter = contract.filters.RoundStateUpdated();
    const pvpActionInvokedFilter = contract.filters.PvpActionInvoked();
    console.log('roundStartedFilter', roundStartedFilter);
    console.log('roundStateUpdatedFilter', roundStateUpdatedFilter);
    console.log('pvpActionInvokedFilter', pvpActionInvokedFilter);
    // Listen using filters
    contract.on(roundStartedFilter, async (eventPayload) => {
      // The args array contains the decoded parameters in order
      const [roundId, startTime, endTime] = eventPayload.args;

      console.log('RoundStarted event:', {
        roundId: roundId,
        startTime: startTime, // Convert from unix timestamp if needed
        endTime: endTime, // Convert from unix timestamp if needed
        blockNumber: eventPayload.log.blockNumber,
        transactionHash: eventPayload.log.transactionHash,
      });
    });

    contract.on(roundStateUpdatedFilter, async (eventPayload) => {
      const [roundId, newState] = eventPayload.args;
      console.log('RoundStateUpdated event:', {
        roundId: roundId,
        newState: newState,
        blockNumber: eventPayload.log.blockNumber,
        transactionHash: eventPayload.log.transactionHash,
      });
    });

    contract.on(pvpActionInvokedFilter, async (eventPayload) => {
      const [verbHash, address, endTime, parameters] = eventPayload.args;
      console.log('\n=== PvpActionInvoked Event Details ===');

      // Decode the verb
      const verb = verbHashToString[verbHash.hash];
      if (!verb) {
        console.error('Unknown verb hash:', verbHash.hash);
        return;
      }

      // Decode the parameters
      const decodedParameters = decodePvpInvokeParameters(verb, parameters);
      if (!decodedParameters) {
        console.error('Failed to decode parameters');
        return;
      }

      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id')
        .eq('contract_address', contractAddress)
        .single();

      if (roomError) {
        console.error('Error fetching room:', roomError);
        return;
      }

      const { data: round, error: roundError } = await supabase
        .from('rounds')
        .select('id, round_agents(*, agents(*))')
        .eq('room_id', room.id)
        .eq('status', 'OPEN')
        .single();

      if (roundError) {
        if (roundError.code === 'PGRST106') {
          console.error(`No open round found for room ${room.id}, skipping pvp notification`);
          return;
        }
        console.error('Error fetching round:', roundError);
        return;
      }

      // Create a structured object matching your schema types
      const pvpAction = getPvpActionFromVerb(verb, decodedParameters);

      // Log the decoded data
      console.log('\nDecoded Data:');
      console.log('- Verb:', verb);
      console.log('- Address:', address);
      console.log('- End Time:', endTime);
      console.log('- Decoded Parameters:', decodedParameters);
      console.log('\nStructured PVP Action:', pvpAction);

      const pvpActionMessage = {
        messageType: WsMessageTypes.PVP_ACTION_ENACTED,
        signature: 'signature',
        sender: address,
        content: {
          roundId: round.id,
          instigator: address,
          timestamp: endTime,
          roomId: room.id,
          action: pvpAction,
        },
      } satisfies z.infer<typeof pvpActionEnactedAiChatOutputSchema>;

      await wsOps.broadcastToAiChat({
        roomId: HARDCODED_ROOM,
        record: {
          agent_id: 57, //TODO hardcoding so bad, feels so bad, profound sadness, mama GM
          message: pvpActionMessage,
          round_id: round.id,
          message_type: WsMessageTypes.PVP_ACTION_ENACTED,
          original_author: null,
          pvp_status_effects: {}, // Our contract is the source of truth, this field is an artifact
        } satisfies Database['public']['Tables']['round_agent_messages']['Insert'],
      });
    });

    // Log available events
    // Query past events

    // Uncomment below to get historical dump
    // const latestBlock = await provider.getBlockNumber();
    // const fromBlock = latestBlock - 1000; // Last 1000 blocks
    // console.log('HERE');

    // console.log(`Querying past events from block ${fromBlock} to ${latestBlock}`);
    // const pastEvents = await contract.queryFilter(contract.filters.PvpActionInvoked(), fromBlock);

    // console.log('Found past PvpActionInvoked events:', pastEvents.length);
    // pastEvents.forEach((event) => {
    //   console.log('Past event:', {
    //     blockNumber: event.blockNumber,
    //     transactionHash: event.transactionHash,
    //     args: event.data,
    //   });
    // });

    // Add a test event listener for all events. This is very noisy.
    // contract.on('*', (event) => {
    //   console.log('Received raw event:', event);
    // });

    // Instead, add error handling for the WebSocketProvider if you need it
    // if (provider instanceof ethers.WebSocketProvider) {
    //   provider.websocket.on('error', (error: Error) => {
    //     console.error('WebSocket error:', error);
    //   });
    // }
  } catch (error) {
    console.error('Error in startContractEventListener:', error);
    // Retry after delay
    setTimeout(() => {
      startContractEventListener().catch(console.error);
    }, 5000);
  }
}

// Start the listener and handle any promise rejections
startContractEventListener().catch(console.error);
