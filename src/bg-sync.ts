import { supabase } from "./config";
// import { roundService } from '../services/roundService';
import { roomService } from "./services/roomService";
import { CronJob } from 'cron';
import { Database } from "./types/database.types";
import { getRoomContract } from "./room-contract";
import { wsOps } from "./ws/operations";



const contract = getRoomContract("0xb6d8A85fC149F13779518DC1D3D14434f3aD3ff7");

// Listen for the RoundCreated event
contract.on("RoundStarted", (roundId, startTime, endTime) => {
  console.log(`RoundCreated event detected: roundId=${roundId}, startTime=${startTime}, startTime=${endTime}`);
  // Add your logic to handle the event here
});

contract.on("*", (event) => {
  console.log(`Event detected: ${event.event}`);
  console.log(event);
  // Add your logic to handle the event here
});

async function checkAndCreateRounds() {
  try {
    // Query rooms that need new rounds
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
    // First, mark any existing ACTIVE rounds as CANCELLED
    const { error: updateError } = await supabase
      .from('rounds')
      .update({ status: 'CANCELLED', active: false })
      .eq('room_id', room.id)
      .eq('active', true);

    if (updateError) {
      console.error('Error updating existing rounds:', updateError);
      return;
    }

    // Create new round
    const { error: insertError } = await supabase
      .from('rounds')
      .insert({
        room_id: room.id,
        active: true,
        status: 'STARTING',
        round_config: room.room_config,
      });

    if (insertError) {
      console.error('Error creating new round:', insertError);
      return;
    }

    // TODO: use room contract address from room config
    const tx = await contract.startRound();
    const receipt = await tx.wait();

    console.log(receipt);

    return;

    // Listen for RoundCreated event
    const roundCreatedEvent = receipt.events?.find(
      (event: any) => event.event === "RoundCreated"
    );

    if(!roundCreatedEvent) {
      // get round data from event
      await supabase
      .from('rounds')
      .update({ status: 'OPEN' })
      .eq('room_id', room.id)
      .eq('active', true);

      wsOps.sendMessageToRoom({
        roomId: room.id,
        message: {
          type: 'ROUND_CREATED',
          payload: {
            round_id: roundCreatedEvent.args.roundId,
            round_config: room.room_config,
          },
        },
      })
    }

    console.log(`Started round in contract: ${tx.hash}`);

    console.log(`Created new round for room ${room.id}`);

  } catch (error) {
    console.error('Error in createNewRound:', error);
  }
}

async function checkAndCloseRounds() {
  try {
    // Query rooms that need new rounds
    const { data: roundsToClose, error } = await supabase.rpc('get_active_rounds_to_close');

    if (error) {
      console.error('Error fetching rounds:', error);
      return;
    }

    // Process each room that needs a new round
    for (const round of roundsToClose || []) {
      // console.log(room.id);
      await startCloseRound(round);
    }

  } catch (error) {
    console.error('Error in checkAndCreateRounds:', error);
  }
}

async function startCloseRound(round: Database['public']['Functions']['get_active_rounds_to_close']['Returns'][0]) {
  const { error: updateError } = await supabase
      .from('rounds')
      .update({ status: 'CLOSING' })
      .eq('id', round.id)
      .eq('status', 'OPEN')
      .eq('active', true);

  if(updateError) {
    console.error('Error updating round:', updateError);
    return;
  }

  wsOps.sendMessageToRoom({
    roomId: round.id,
    message: {
      type: 'ROUND_CLOSING',
      payload: {
        round_id: round.id,
      },
    },
  })
}



const job = new CronJob('*/60 * * * * *', checkAndCreateRounds);
job.start();
