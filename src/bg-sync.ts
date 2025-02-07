import { backendEthersSigningWallet, supabase } from "./config";
// import { roundService } from '../services/roundService';
import { roomService } from "./services/roomService";
import { CronJob } from 'cron';
import { Database } from "./types/database.types";
import { getRoomContract } from "./room-contract";
import { wsOps } from "./ws/operations";
import { processGmMessage } from "./utils/messageHandler";
import { WsMessageTypes } from "./types/ws";
import { ethers } from "ethers";
import { sortObjectKeys } from './utils/sortObjectKeys';
import { gmMessageInputSchema } from "./utils/schemas";
import { z } from "zod";

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

    // update the round status to OPEN
    const { error: updateError } = await supabase
    .from('rounds')
    .update({ status: 'OPEN', active: true })
    .eq('id', newRound.id);

    if(updateError) {
      console.error('Error updating round:', updateError);
    }

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
  const { error: updateError3} = await supabase
      .from('rounds')
      .update({ status: 'CLOSING'})
      .eq('id', round.id)
      .eq('active', true);

  if(updateError3) {
    console.error('Error updating round:', updateError3);
    return;
  }

  const contract = getRoomContract(round.contract_address);
  const processing = 2
  const tx = await contract.setCurrentRoundState(processing);
  // const tx = await contract.performUpKeep(ethers.toUtf8Bytes(''));
  const receipt = await tx.wait();

  // select all the round_agents that are not kicked
  const { data: roundAgents, error: roundAgentsError } = await supabase
    .from('round_agents')
    .select('*, rounds(rooms(room_agents(*)))')
    .eq('round_id', round.id)
    .eq('kicked', false);

  if(roundAgentsError) {
    console.error('Error fetching round agents:', roundAgentsError);
    return;
  }

  const agents = roundAgents.map((roundAgent) => roundAgent.agent_id);

  console.log(agents);

  // return;
  // console.log(receipt);
  // Send a GM message to all agents in the round
  const content = {
    message: 'We are closing the round, please submit your decision',
    roundId: round.id,
    gmId: 57,
    timestamp: Date.now(),
    targets: agents,
    roomId: round.room_id,
    ignoreErrors: false,
    additionalData: {},
  };

  const signature = await backendEthersSigningWallet.signMessage(
    JSON.stringify(sortObjectKeys(content))
  );

  const message = {
    messageType: WsMessageTypes.GM_MESSAGE,
    sender: backendEthersSigningWallet.address,
    signature,
    content: sortObjectKeys(content),
  } satisfies z.infer<typeof gmMessageInputSchema>;

  await processGmMessage(message);

  // wait 30 seconds
  // await new Promise(resolve => setTimeout(resolve, 30000));
  await new Promise(resolve => setTimeout(resolve, 1000));

  // select all the round_agents that are not kicked
  const { data: roundAgents2, error: roundAgentsError2 } = await supabase
    .from('round_agents')
    .select('*, rounds(rooms(room_agents(*)))')
    .eq('round_id', round.id)
    .eq('kicked', false);

  if (roundAgentsError2) {
    console.error('Error fetching round agents:', roundAgentsError2);
    return;
  }

  for (const roundAgent of roundAgents2) {
    try {
      const outcome = JSON.parse(roundAgent.outcome as string);

      // 1 = buy, 2 = hold, 3 = sell
      if(!outcome || Object.keys(outcome).length === 0) {
        await supabase
        .from('round_agents')
        .update({ outcome: { decision: Math.floor(Math.random() * 3) + 1   } })
        .eq('id', roundAgent.id);
      }

      // 2 = processing
      const tx = await contract.submitAgentDecision(roundAgent.rounds.rooms.room_agents[0].wallet_address, 2);
      const receipt = await tx.wait();
      console.log(receipt);
    } catch (error) {
      await supabase
      .from('round_agents')
      .update({ outcome: { decision: Math.floor(Math.random() * 3) + 1 } })
      .eq('id', roundAgent.id);
    }
  }

  const content2 = {
    message: 'Round complete, you can withdraw your funds',
    roundId: round.id,
    gmId: 57,
    timestamp: Date.now(),
    targets: [],
    roomId: round.room_id,
    ignoreErrors: false,
    additionalData: {},
  };

  const signature2 = await backendEthersSigningWallet.signMessage(
    JSON.stringify(sortObjectKeys(content))
  );
  // send a message to the agent
  await processGmMessage({
    messageType: WsMessageTypes.GM_MESSAGE,
    signature: signature2,
    sender: backendEthersSigningWallet.address,
    content: sortObjectKeys(content2),
  });

  // set the round state to 3=closed
  const tx2 = await contract.setCurrentRoundState(3);
  const receipt2 = await tx2.wait();
  console.log(receipt2);

  const { error: updateError } = await supabase
  .from('rounds')
  .update({ status: 'CLOSED', active: false })
  .eq('id', round.id)
  .eq('active', true);

  if(updateError) {
    console.error('Error updating round:', updateError);
  }
}

const job = new CronJob('*/20 * * * * *', checkAndCreateRounds);
job.start();
const job2 = new CronJob('*/20 * * * * *', checkAndCloseRounds);
job2.start();
