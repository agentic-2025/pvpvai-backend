import { CdpAgentkit } from '@coinbase/cdp-agentkit-core';
import { CdpTool } from '@coinbase/cdp-langchain';
import { z } from 'zod';
import { supabase } from '../../config';

// Define the prompt for the get round data action
const GET_ROUND_DATA_PROMPT = `
This tool fetches data about active rounds from the database, including:
- Round and room information
- Chain details
- Agent participants and their wallet addresses
- Agent status (kicked or active)
`;

// Define the schema for agent data
const AgentDataSchema = z.object({
  name: z.string(),
  wallet_address: z.string().nullable(),
  kicked: z.boolean(),
});

// Define the schema for round data
export const RoundDataSchema = z.object({
  round_id: z.number(),
  round_config: z.any(),
  room_id: z.number(),
  room_type: z.number(),
  chain_id: z.number(),
  chain_family: z.string(),
  agents: z.array(AgentDataSchema),
  token: z.string(),
});

// Export the types derived from the schemas
export type AgentData = z.infer<typeof AgentDataSchema>;
export type RoundData = z.infer<typeof RoundDataSchema>;

// Define the input schema using Zod (empty since we don't need input parameters)
const GetRoundDataInput = z.object({}).strip().describe('No input needed to fetch round data');

/**
 * Fetches data about active rounds from Supabase
 * @returns Array of round data including room and agent information
 */
export async function getRoundDataFromSupabase(): Promise<RoundData[]> {
  const { data: roundsData, error } = await supabase
    .from('rounds')
    .select(
      `
      id,
      room_id,
      round_config,
      rooms (
        chain_id,
        chain_family,
        type_id,
        room_agents (
          wallet_address,
          wallet_json,
          agents (
            id,
            display_name
          )
        )
      ),
      round_agents!inner (
        kicked,
        agent_id
      )
    `
    )
    .eq('active', true);

  if (error) {
    throw new Error(`Error fetching round data: ${error.message}`);
  }

  if (!roundsData) {
    return [];
  }
  console.log('roundsData', roundsData);
  return roundsData.map((round) => {
    const agentMap = new Map<number, AgentData>();

    round.rooms.room_agents.forEach((roomAgent) => {
      if (roomAgent.agents?.display_name) {
        agentMap.set(roomAgent.agents.id, {
          name: roomAgent.agents.display_name,
          wallet_address: roomAgent.wallet_address,
          kicked:
            round.round_agents.find((roundAgent) => roundAgent.agent_id === roomAgent.agents.id)
              ?.kicked ?? false,
        });
      }
    });

    return {
      round_id: round.id,
      round_config: round.round_config,
      room_id: round.room_id,
      room_type: round.rooms.type_id,
      chain_id: round.rooms.chain_id,
      chain_family: round.rooms.chain_family,
      // network:
      agents: Array.from(agentMap.values()),
      token: (round.round_config as any)?.room_type_config?.token,
    };
  });
}

const getRoundDataTool = (agentkit: CdpAgentkit) => {
  return new CdpTool(
    {
      name: 'get_round_data',
      description: GET_ROUND_DATA_PROMPT,
      argsSchema: GetRoundDataInput,
      func: async () => {
        const roundData = await getRoundDataFromSupabase();
        return JSON.stringify(roundData, null, 2);
      },
    },
    agentkit
  );
};

export default getRoundDataTool;
