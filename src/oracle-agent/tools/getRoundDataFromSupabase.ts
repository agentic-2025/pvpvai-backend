import { customActionProvider, WalletProvider } from '@coinbase/agentkit';
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
  id: z.number(),
  name: z.string(),
  wallet_address: z.string().nullable(),
  wallet_json: z.any().nullable(),
  kicked: z.boolean(),
});

// Define the schema for round data
const RoundDataSchema = z.object({
  round_id: z.number(),
  round_config: z.any(),
  room_id: z.number(),
  room_type: z.number(),
  chain_id: z.number(),
  chain_family: z.string(),
  agents: z.array(AgentDataSchema),
  token: z.string(),
});

// Define the input schema (empty since we don't need input parameters)
const GetRoundDataInput = z.object({}).strip().describe('No input needed to fetch round data');

export const getLatestRoundDataFromSupabase = async (): Promise<RoundData[]> => {
  try {
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

    return roundsData.map((round) => {
      const agentMap = new Map<number, AgentData>();

      round.rooms.room_agents.forEach((roomAgent) => {
        if (roomAgent.agents?.display_name) {
          agentMap.set(roomAgent.agents.id, {
            id: roomAgent.agents.id,
            name: roomAgent.agents.display_name,
            wallet_address: roomAgent.wallet_address,
            wallet_json: roomAgent.wallet_json,
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
        agents: Array.from(agentMap.values()),
        token: (round.round_config as any)?.room_type_config?.token,
      };
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get round data: ${error.message}`);
    }
    throw new Error('Failed to get round data: Unknown error');
  }
};
// Export types if needed elsewhere
export type AgentData = z.infer<typeof AgentDataSchema>;
export type RoundData = z.infer<typeof RoundDataSchema>;

const getRoundDataProvider = customActionProvider<WalletProvider>({
  name: 'get_round_data',
  description: GET_ROUND_DATA_PROMPT,
  schema: GetRoundDataInput,
  invoke: getLatestRoundDataFromSupabase,
});

export { getRoundDataProvider };
