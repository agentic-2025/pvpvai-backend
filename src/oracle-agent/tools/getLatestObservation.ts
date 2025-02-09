import { customActionProvider, WalletProvider } from '@coinbase/agentkit';
import { z } from 'zod';
import { supabase } from '../../config';
// Define the prompt for the get latest observation action
const GET_LATEST_OBSERVATION_PROMPT = `
This tool fetches the latest observation of a given observationType for a given round from Supabase.
`;

// Define the input schema using Zod
const GetLatestObservationInput = z
  .object({
    roundId: z.number().describe('The round ID to fetch observations for'),
  })
  .describe('Parameters for getting latest observation');

const getLatestObservationProvider = customActionProvider<WalletProvider>({
  // wallet types specify which providers can use this action. It can be as generic as WalletProvider or as specific as CdpWalletProvider
  name: 'get_latest_observation',
  description: GET_LATEST_OBSERVATION_PROMPT,
  schema: GetLatestObservationInput,
  invoke: async (
    args: any
  ): Promise<{
    round_id: number;
    content: any;
  }> => {
    try {
      const { data: observation, error } = await supabase
        .from('round_observations')
        .select('round_id, content')
        .eq('round_id', args.roundId)
        .eq('observation_type', 'wallet-balances')
        .order('created_at', { ascending: false })
        .limit(1);

      return {
        round_id: args.roundId,
        content: (observation?.[0]?.content as any) || {},
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get latest observation: ${error.message}`);
      }
      throw new Error('Failed to get latest observation: Unknown error');
    }
  },
});

export { getLatestObservationProvider };
