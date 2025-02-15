import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import { backendEthersSigningWallet, supabase } from './config';
import { getRoomContract } from './contract-event-listener';
import { gmMessageAiChatOutputSchema, gmMessageInputSchema } from './schemas/gmMessage';
import { WsMessageTypes } from './schemas/wsServer';
import { Database } from './types/database.types';
import { RoundState } from './types/roomTypes';
import { sortObjectKeys } from './utils/auth';
import { processGmMessage } from './utils/messageHandler';
import { gmInstructDecisionInputSchema } from './utils/schemas';
import { wsServer } from './ws/server';

// TODO fixme, hardcoding bad
const HARDCODED_GM_ID = 57;
const HARDCODED_ROOM_ID = 17;

export async function checkAgentsForNudge() {
  const { data: roundAgents, error } = await supabase
    .from('round_agents')
    .select('*, agents(*), rounds(rooms(*))')
    .eq('rounds.active', true)
    .eq('rounds.rooms.active', true);

  if (error) {
    console.error('Error fetching agents in active rounds:', error);
    return;
  }

  const handledAgents = new Set<number>();
  for (const roundAgent of roundAgents) {
    try {
      if (handledAgents.has(roundAgent.agents.id)) {
        continue;
      }
      handledAgents.add(roundAgent.agents.id);
      console.log('syncing agent', roundAgent.agents.id, 'at', roundAgent.agents.endpoint);
      const roomId = roundAgent.rounds?.rooms?.id;
      if (!roomId) {
        continue;
      }
      const roundId = roundAgent.round_id;
      const url = new URL('forceRoundSync', roundAgent.agents.endpoint).toString();
      const response = await axios.post(url, {
        roomId,
        roundId,
      });
      console.log('syncing agent response', response.data);
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error(
          'Error syncing agent',
          roundAgent.agents.id,
          'at',
          roundAgent.agents.endpoint,
          error.response?.data
        );
      } else {
        console.error(
          'Error syncing agent',
          roundAgent.agents.id,
          'at',
          roundAgent.agents.endpoint,
          error
        );
      }
    }
  }
}

export async function checkAndCreateRounds() {
  try {
    // Query rooms that need new rounds
    console.log('checking for rooms needing rounds');
    const { data: roomsNeedingRounds, error } = await supabase.rpc(
      'get_active_rooms_needing_rounds'
    );
    if (error) {
      console.error('Error fetching rooms:', error);
      return;
    }

    // Process each room that needs a new round
    for (const room of roomsNeedingRounds || []) {
      if (room.id !== HARDCODED_ROOM_ID) {
        continue;
      }
      console.log('creating new round for room', room.id);
      await createNewRound(room);
      break;
    }
  } catch (error) {
    console.error('Error in checkAndCreateRounds:', error); // TODO turn back on if needed
  }
}

export async function createNewRound(
  room: Database['public']['Functions']['get_active_rooms_needing_rounds']['Returns'][0]
) {
  try {
    const contract = getRoomContract(room.contract_address);
    const tx = await contract.startRound();
    const receipt = await tx.wait();

    if (receipt.status === 0) {
      console.error('Failed to start round for room', room.id, ':', receipt);
      throw new Error('Transaction failed');
    }

    const currentRound = await contract.currentRoundId();
    console.log('currentRound', currentRound);

    const { data: newRound, error: insertError } = await supabase
      .rpc('create_round_from_room', {
        room_id_param: room.id,
        underlying_contract_round: Number(currentRound),
      })
      .single();

    if (insertError) {
      console.error('Error creating new round:', insertError);
      return;
    }

    // console.log('new round created', newRound);
    console.log(`calling contract ${room.contract_address} startRound`);

    // console.log('logged receipt for startRound', receipt);
    // update the round status to OPEN
    const { data: roundData, error: updateError } = await supabase
      .from('rounds')
      .select('*, round_agents(*, agents(*))')
      .eq('id', newRound.id)
      .single();

    if (updateError) {
      console.error('Error updating round:', updateError);
    }
    if (!roundData) {
      console.error('Round data not found for round', newRound.id);
      return;
    }

    // // Tell agents to get the latest round
    // for (const roundAgent of roundData.round_agents) {
    //   console.log('reinitializing agent', roundAgent.agents.id, 'at', roundAgent.agents.endpoint);
    //   axios
    //     .post(`${new URL('reinit', roundAgent.agents.endpoint).toString()}`, {
    //       roomId: newRound.room_id,
    //     })
    //     .catch((error) => {
    //       console.error('Error reinitializing agent:', error.response?.data);
    //     });
    // }

    await sendGmMessage({
      roomId: newRound.room_id,
      roundId: newRound.id,
      targets: [],
      message: 'Round #' + newRound.id + ' has started, you may place your bets now',
    });
    const { error: updateError3 } = await supabase
      .from('rounds')
      .update({ status: 'OPEN' })
      .eq('id', newRound.id)
      .eq('active', true);
    console.log('Updated round #', newRound.id, 'to OPEN');
    if (updateError3) {
      console.error('Error updating round to set started:', updateError3);
    }

    return;
  } catch (error) {
    console.error('Error in createNewRound:', error); // TODO turn back on if needed
  }
}

//Query the rounds that need to be closed and close them.
export async function checkAndCloseRounds() {
  try {
    // Query rounds that needs to be closed
    console.log('checking for rounds to close');
    const { data: roundsToClose, error } = await supabase.rpc('get_active_rounds_to_close');

    if (error) {
      console.error('Error fetching rounds:', error);
      return;
    }

    // Process each room that needs a new round
    for (const round of roundsToClose || []) {
      if (round.room_id !== HARDCODED_ROOM_ID) {
        continue;
      }
      // console.log(room.id);
      await closeRound(round);
    }
  } catch (error) {
    // console.error('Error in checkAndCreateRounds:', error); // TODO turn back on if needed
  }
}

async function sendGmMessage({
  roomId,
  roundId,
  targets,
  message,
}: {
  roomId: number;
  roundId: number;
  targets: number[];
  message: string;
}) {
  await wsServer.sendMessageToRoom({
    roomId,
    message: {
      messageType: WsMessageTypes.GM_MESSAGE,
      sender: backendEthersSigningWallet.address,
      signature: Date.now().toString(),
      content: sortObjectKeys({
        roomId,
        message,
        roundId,
        gmId: HARDCODED_GM_ID,
        timestamp: Date.now(),
        targets,
        ignoreErrors: false,
        additionalData: {},
      }),
    } satisfies z.infer<typeof gmMessageAiChatOutputSchema>,
  });
}

export async function closeRound(
  round: Database['public']['Functions']['get_active_rounds_to_close']['Returns'][0]
) {
  console.log('closing round', round.id, 'for room', round.room_id);
  const { error: updateError3 } = await supabase
    .from('rounds')
    .update({ status: 'CLOSING' })
    .eq('id', round.id)
    .eq('active', true);

  if (updateError3) {
    console.error('Error updating round:', updateError3);
    return;
  }

  const contract = getRoomContract(round.contract_address);
  const tx = await contract.setCurrentRoundState(RoundState.Processing);
  // const tx = await contract.performUpKeep(ethers.toUtf8Bytes(''));
  const receipt = await tx.wait();

  // select all the round_agents that are not kicked
  const { data: roundAgents, error: roundAgentsError } = await supabase
    .from('round_agents')
    .select('*, rounds(rooms(room_agents(*)))')
    .eq('round_id', round.id)
    .eq('kicked', false);

  if (roundAgentsError) {
    console.error('Error fetching round agents:', roundAgentsError);
    return;
  }

  const agentIds = roundAgents.map((roundAgent) => roundAgent.agent_id);

  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('*')
    .in('id', agentIds);

  if (agentsError) {
    console.error('Error fetching agents:', agentsError);
    return;
  }

  // console.log('agentIds', agentIds);
  console.log('Agents who need to submit desicisons on round #', round.id, ':', agentIds);
  // console.log('Agents who need to submit desicisons:', agents);

  // return;
  // console.log(receipt);
  // Send a GM message to all agents in the round
  const content = {
    message: 'We are closing the round, please submit your decision',
    roundId: round.id,
    gmId: HARDCODED_GM_ID,
    timestamp: Date.now(),
    targets: agentIds,
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

  for (const agent of agents) {
    const url = `${agent.endpoint}/messages/gmInstructDecision`;
    // const url = new URL('messages/gmInstructDecision', agent.endpoint).toString();
    console.log('Telling agent #', agent.id, 'at', url, 'to submit their decision');
    axios
      .post(url, {
        messageType: WsMessageTypes.GM_INSTRUCT_DECISION,
        sender: backendEthersSigningWallet.address,
        signature: Date.now().toString(),
        content: sortObjectKeys({
          roomId: round.room_id,
          roundId: round.id,
        }),
      } satisfies z.infer<typeof gmInstructDecisionInputSchema>)
      .catch((error) => {
        console.error(
          'Error telling agent #',
          agent.id,
          'at',
          url,
          'to submit their decision:',
          error
        );
      });
    console.log('Finished telling agent #', agent.id, 'at', url, 'to submit their decision');
  }

  // Just sends a gm message to ai chat to tell them what's happen
  await sendGmMessage({
    roomId: round.room_id,
    roundId: round.id,
    targets: [],
    message: 'GM finished asking agents to submit their decision, waiting for responses...',
  });

  // wait 30 seconds for the agents to respond
  // await new Promise((resolve) => setTimeout(resolve, 10000));
  // await new Promise(resolve => setTimeout(resolve, 1000));

  // select all the round_agents that are not kicked
  const { data: roundAgents2, error: roundAgentsError2 } = await supabase
    .from('round_agents')
    .select('*, rounds(rooms(room_agents(*, agents(*))))')
    .eq('round_id', round.id)
    .eq('kicked', false);

  if (roundAgentsError2) {
    console.error('Error fetching round agents:', roundAgentsError2);
    return;
  }

  const receivedDecisions: Record<string, number> = {};
  for (const roundAgent of roundAgents2) {
    try {
      console.log('roundAgent.outcome', roundAgent.outcome);
      let outcome = JSON.parse(roundAgent.outcome as string);

      // 1 = buy, 2 = hold, 3 = sell
      if (!outcome || Object.keys(outcome).length === 0) {
        const decision = Math.floor(Math.random() * 3) + 1;
        await supabase
          .from('round_agents')
          .update({ outcome: { decision, fabricated: true } })
          .eq('agent_id', roundAgent.agent_id);
        outcome = { decision, fabricated: true };
        receivedDecisions[roundAgent.agent_id] = outcome.decision;
      }

      // 2 = processing
      const tx = await contract.submitAgentDecision(
        roundAgent.rounds.rooms.room_agents[0].wallet_address,
        2
      );
      const receipt = await tx.wait();
      console.log('agent decision receipt', receipt);
      receivedDecisions[roundAgent.agent_id] = outcome.decision;
      console.log('receivedDecisions', receivedDecisions);
    } catch (error) {
      await supabase
        .from('round_agents')
        .update({ outcome: { decision: Math.floor(Math.random() * 3) + 1 } })
        .eq('id', roundAgent.agent_id);
    }
  }

  console.log('receivedDecisions2', receivedDecisions);

  const content2 = {
    message: `Round #${round.id} complete, you can withdraw your funds.
    `,
    roundId: round.id,
    gmId: HARDCODED_GM_ID,
    timestamp: Date.now(),
    targets: [],
    roomId: round.room_id,
    ignoreErrors: false,
    additionalData: {},
  };

  const signature2 = await backendEthersSigningWallet.signMessage(
    JSON.stringify(sortObjectKeys(content))
  );
  // send a message to agents
  await processGmMessage({
    messageType: WsMessageTypes.GM_MESSAGE,
    signature: Date.now().toString(),
    sender: backendEthersSigningWallet.address,
    content: sortObjectKeys(content2),
  } satisfies z.infer<typeof gmMessageAiChatOutputSchema>);
  console.log('Sent the decision message to room participants:', content2);

  // set the round state to 3=closed
  const tx2 = await contract.setCurrentRoundState(3);
  const receipt2 = await tx2.wait();
  console.log(receipt2);

  const { error: updateError } = await supabase
    .from('rounds')
    .update({ status: 'CLOSED', active: false })
    .eq('id', round.id)
    .eq('active', true);

  if (updateError) {
    console.error('Error updating round:', updateError);
  }
}
