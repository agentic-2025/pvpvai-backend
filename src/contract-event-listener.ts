import { backendEthersSigningWallet, supabase } from "./config";
// import { roundService } from '../services/roundService';
import { roomService } from "./services/roomService";
import { CronJob } from 'cron';
import { Database } from "./types/database.types";
import { getRoomContract } from "./room-contract";
import { wsOps } from "./ws/operations";
import { processContractEvent, processGmMessage } from "./utils/messageHandler";
import { WsMessageTypes } from "./types/ws";
import { ethers } from "ethers";
import { sortObjectKeys } from './utils/sortObjectKeys';
import { gmMessageInputSchema } from "./utils/schemas";
import { z } from "zod";
import { roomAbi } from "./types/contract.types";

console.log("Starting contract event listener");

// Base Sepolia RPC URL (Use Alchemy, Infura, or Public RPC)

// Error in createNewRound: Error: network does not support ENS (operation="getEnsAddress",
export function startContractEventListener() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);

// Your deployed contract address
  const contractAddress = "0x9Bd805b04809AeE006Eb05572AAFB2807A03eCDb";

// Create contract instance
  const contract = new ethers.Contract(contractAddress, roomAbi, provider);

  console.log("Starting contract event listener");

  contract.on("PvpActionInvoked", (verb, address: string, endTime: number, parameters: any, event: any) => {
    console.log(`PvpActionInvoked`);

    const verbHash = event.topics[1]; // Indexed parameters are in event.topics
    console.log(`Raw Indexed Verb Hash: ${verbHash}`);
    // Convert BigNumber to number using ethers.js BigNumber methods
    // const verbNumber = ethers.getBigInt(verb);

    console.log(`Verb: ${verb.toString()}, Address: ${address}, EndTime: ${endTime}`);
    // processContractEvent(contractAddress, address, endTime, parameters);
    // console.log("Full Event:", parameters);
  });


}
