import { customActionProvider, EvmWalletProvider } from '@coinbase/agentkit';
import { hashMessage } from '@coinbase/coinbase-sdk';
import axios from 'axios';
import { z } from 'zod';
import { observationMessageContentSchema } from '../../utils/schemas';

// Define the prompt for the post observation action
const POST_OBSERVATION_PROMPT = `
This tool takes an observation (price data, news, wallet balances, etc) and sends a POST request to the backed to publish the observation.
It requires the current wallet to be passed as well as the observation data.
`;

// Define schemas for different observation types
const WalletBalanceContent = z.object({
  roomId: z.number(),
  roundId: z.number(),
  timestamp: z.number(),
  // walletBalances: z.record(
  //   z.string(),
  //   z.object({
  //     nativeBalance: z.bigint(),
  //     tokenBalances: z.record(
  //       z.string(),
  //       z.object({
  //         balance: z.bigint(),
  //         valueUsd: z.number(),
  //         valueNative: z.bigint(),
  //       })
  //     ),
  //     nativeBalanceValueUsd: z.number(),
  //     tokenBalanceValueUsd: z.number(),
  //     tokenBalanceValueNative: z.bigint(),
  //   })
  // ),
});

const PriceUpdateContent = z.object({
  roomId: z.number(),
  roundId: z.number(),
  timestamp: z.number(),
  // prices: z.record(
  //   z.string(),
  //   z.object({
  //     address: z.string(),
  //     symbol: z.string(),
  //     source: z.string(),
  //     tokenPriceNative: z.number(),
  //     tokenPriceUsd: z.number(),
  //   })
  // ),
});

// Define the input schema using Zod
// const PostObservationInput = z.object({}).passthrough();
// const PostObservationInput = z
//   .object({
//     account: z.string(),
//     observationType: z.enum(['wallet-balances', 'price-update', 'game-event']),
//     // content: z.union([WalletBalanceContent, PriceUpdateContent]),
//     content: z.any(),
//   })
//   .describe('Observation data to post');

const postObservationProvider = customActionProvider<EvmWalletProvider>({
  name: 'post_observation',
  description: POST_OBSERVATION_PROMPT,
  schema: observationMessageContentSchema,
  invoke: async (wallet, args: any): Promise<string> => {
    try {
      const timestamp = Date.now();
      // Ensure args has the correct structure for observations
      const content = {
        timestamp,
        roomId: args.roomId,
        roundId: args.roundId,
        agentId: args.agentId,
        observationType: args.observationType,
        data: args.data,
      };

      // Create signature of the observation data
      const observationString = JSON.stringify(content);
      const signature = await wallet.signMessage(hashMessage(observationString));

      // Post to the observations endpoint with the correct message structure
      const response = await axios.post(
        `${process.env.BACKEND_URL || 'http://localhost:3000'}/messages/observations`,
        {
          messageType: 'observation',
          sender: await wallet.getAddress(),
          signature,
          content,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return JSON.stringify(
        {
          message: 'Observation posted successfully',
          status: response.status,
          data: response.data,
        },
        null,
        2
      );
    } catch (error) {
      console.error('Failed to post observation:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to post observation: ${error.message}`);
      }
      throw new Error('Failed to post observation: Unknown error');
    }
  },
});

export { postObservationProvider };
