import { supabase } from "./config";
// import { roundService } from '../services/roundService';
import { roomService } from "./services/roomService";
import { CronJob } from 'cron';
import { Database } from "./types/database.types";


async function checkAndCreateRounds() {
  try {
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();

    // Query rooms that need new rounds
    const { data: roomsNeedingRounds, error } = await supabase.rpc('get_active_rooms_needing_rounds');

    if (error) {
      console.error('Error fetching rooms:', error);
      return;
    }

    // Process each room that needs a new round
    for (const room of roomsNeedingRounds || []) {
      // console.log(room.id);
      await createNewRound(room);
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

    console.log(`Created new round for room ${room.id}`);

  } catch (error) {
    console.error('Error in createNewRound:', error);
  }
}

const job = new CronJob('*/10 * * * * *', checkAndCreateRounds);
job.start();
