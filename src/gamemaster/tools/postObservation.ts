import { CdpAgentkit } from '@coinbase/cdp-agentkit-core';
import { CdpTool } from '@coinbase/cdp-langchain';
import { hashMessage } from '@coinbase/coinbase-sdk';
import axios from 'axios';
import { z } from 'zod';

// Define the prompt for the post observation action
const POST_OBSERVATION_PROMPT = `
This tool post a single wallet balance observation to the backend.
It will:
1. Modify the payload for authentication against the backend
2. Send the data to the observations endpoint
3. Return the response from the server
`;

// Define the input schema using Zod
const PostObservationInput = z
  .object({
    timestamp: z.number(),
    account: z.string(),
    observationType: z.enum(['wallet-balances', 'price-update', 'game-event']),
    content: z.object({
      roomId: z.number(),
      roundId: z.number(),
      walletBalances: z.record(
        z.string(),
        z.object({
          nativeBalance: z.string(),
          tokenBalance: z.string(),
          nativeValue: z.string(),
          usdValue: z.string(),
          percentChangeNative: z.number().nullable(),
          percentChangeUsd: z.number().nullable(),
        })
      ),
      prices: z.object({
        source: z.string(),
        tokenPriceNative: z.string(),
        tokenPriceUsd: z.string(),
        nativePriceUsd: z.string(),
      }),
    }),
  })
  .describe('Observation data to post');

/**
 * Posts an observation to the backend
 */
async function postObservation(
  wallet: CdpAgentkit['wallet'],
  args: z.infer<typeof PostObservationInput>
): Promise<string> {
  try {
    //Set the timestamp of args to now in UTC for auth
    args.timestamp = Date.now();
    // Create signature of the observation data
    const observationString = JSON.stringify(args);
    const signature = await wallet.createPayloadSignature(hashMessage(observationString));

    // Post to the observations endpoint
    const response = await axios.post(
      `${process.env.BACKEND_URL || 'http://localhost:3000'}/rooms/observations`,
      args,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization-Signature': signature.toString(),
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
    if (error instanceof Error) {
      throw new Error(`Failed to post observation: ${error.message}`);
    }
    throw new Error('Failed to post observation: Unknown error');
  }
}

const postObservationTool = (agentkit: CdpAgentkit) => {
  return new CdpTool(
    {
      name: 'post_observation',
      description: POST_OBSERVATION_PROMPT,
      argsSchema: PostObservationInput,
      func: postObservation,
    },
    agentkit
  );
};

export default postObservationTool;
