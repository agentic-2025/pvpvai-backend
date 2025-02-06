import { supabase } from "./config";
// import { roundService } from '../services/roundService';
import { roomService } from "./services/roomService";
import { CronJob } from 'cron';
import { Database } from "./types/database.types";
import { getRoomContract } from "./room-contract";
import { wsOps } from "./ws/operations";
import { processGmMessage } from "./utils/messageHandler";
import { WsMessageTypes } from "./types/ws";
import { ethers } from "ethers";

async function checkAndCreateRounds() {
  try {
    // Query rooms that need new rounds
    console.log("checking for rooms needing rounds");
    const { data: roomsNeedingRounds, error } = await supabase.rpc('get_active_rooms_needing_rounds');

    if (error) {
      console.error('Error fetching rooms:', error);
      return;
    }

    // Process each room that needs a new round
    for (const room of roomsNeedingRounds || []) {
      await createNewRound(room);
      break;
    }

  } catch (error) {
    console.error('Error in checkAndCreateRounds:', error);
  }
}

async function createNewRound(room: Database['public']['Functions']['get_active_rooms_needing_rounds']['Returns'][0]) {
  try {
    const { data: newRound, error: insertError } = await supabase
    .rpc('create_round_from_room', {
      room_id_param: room.id
    })
    .single();

    if (insertError) {
      console.error('Error creating new round:', insertError);
      return;
    }

    console.log("new round created", newRound);
    console.log("calling contract #{contract_address} startRound");

    const contract = getRoomContract(room.contract_address);
    const tx = await contract.startRound();
    const receipt = await tx.wait();

    console.log(receipt);

    return;
  } catch (error) {
    console.error('Error in createNewRound:', error);
  }
}

async function checkAndCloseRounds() {
  try {
    // Query rounds that needs to be closed
    console.log("checking for rounds to close");
    const { data: roundsToClose, error } = await supabase.rpc('get_active_rounds_to_close');

    if (error) {
      console.error('Error fetching rounds:', error);
      return;
    }

    // Process each room that needs a new round
    for (const round of roundsToClose || []) {
      // console.log(room.id);
      await closeRound(round);
    }

  } catch (error) {
    console.error('Error in checkAndCreateRounds:', error);
  }
}

async function closeRound(round: Database['public']['Functions']['get_active_rounds_to_close']['Returns'][0]) {
  console.log("closing round", round.id);
  const { error: updateError } = await supabase
      .from('rounds')
      .update({ status: 'CLOSING', active: false })
      .eq('id', round.id)
      .eq('active', true);

  if(updateError) {
    console.error('Error updating round:', updateError);
    return;
  }

  const contract = getRoomContract(round.contract_address);
  const tx = await contract.performUpKeep(ethers.toUtf8Bytes(''));
  const receipt = await tx.wait();

  console.log(receipt);
  // Send a GM message to all agents in the round
  processGmMessage({
    messageType: WsMessageTypes.GM_MESSAGE,
    signature: '',
    sender: '',
    content: {
      message: 'ROUND_CLOSING',
      roundId: round.id,
      gmId: 0,
      timestamp: Date.now(),
      targets: [],
      roomId: round.room_id,
      ignoreErrors: false,
      additionalData: {},
    },
  })

}

// const job = new CronJob('*/10 * * * * *', checkAndCreateRounds);
// job.start();
const job2 = new CronJob('*/10 * * * * *', checkAndCloseRounds);
job2.start();
