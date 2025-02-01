import { CdpAgentkit } from '@coinbase/cdp-agentkit-core';
import { CdpTool } from '@coinbase/cdp-langchain';
import { z } from 'zod';
import { supabase } from '../../config';

// Define the prompt for the get latest observation action
const GET_LATEST_OBSERVATION_PROMPT = `
This tool fetches the latest wallet-balances observation for a specific round from Supabase.
If no observation exists, it returns an empty object.
`;

// Define the input schema using Zod
const GetLatestObservationInput = z
  .object({
    roundId: z.number().describe('The round ID to fetch observations for'),
  })
  .describe('Parameters for getting latest observation');

/**
 * Fetches the latest wallet-balances observation for a round from Supabase
 */
async function getLatestObservation(
  args: z.infer<typeof GetLatestObservationInput>
): Promise<string> {
  try {
    const { data: observation, error } = await supabase
      .from('round_observations')
      .select('round_id, content')
      .eq('round_id', args.roundId)
      .eq('observation_type', 'wallet-balances')
      .order('created_at', { ascending: false })
      .limit(1);

    return JSON.stringify(
      {
        round_id: args.roundId,
        content: (observation?.[0]?.content as any) || {},
      },
      null,
      2
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get latest observation: ${error.message}`);
    }
    throw new Error('Failed to get latest observation: Unknown error');
  }
}

const getLatestObservationTool = (agentkit: CdpAgentkit) => {
  return new CdpTool(
    {
      name: 'get_latest_observation',
      description: GET_LATEST_OBSERVATION_PROMPT,
      argsSchema: GetLatestObservationInput,
      func: getLatestObservation,
    },
    agentkit
  );
};

export default getLatestObservationTool;
