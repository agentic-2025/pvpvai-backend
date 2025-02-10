import { z } from 'zod';
import { authenticatedMessageSchema } from './common';
/*
  OBSERVATION MESSAGES SCHEMA:
  Sent by: Oracle agents
  Received by: 
    - Agents: observationMessageAgentOutputSchema
    - Users (AI Chat): observationMessageAiChatOutputSchema
  Supported by:
    - REST: POST /messages/observations
    - (TODO Not currently supported by WS)

  Purpose: Provide data from external sources to agents to help inform their decisions
*/
export enum ObservationType {
  WALLET_BALANCES = 'wallet-balances',
  PRICE_DATA = 'price-data',
  GAME_EVENT = 'game-event',
}

// Wallet Balance Schemas
export const observationWalletBalanceDataSchema = z.object({
  walletBalances: z.record(
    z.string(),
    z.object({
      nativeBalance: z.bigint(),
      tokenBalances: z.record(z.string(), z.bigint()),
    })
  ),
});

// Price Data Schemas
export const observationPriceDataSchema = z.object({
  nativePrice: z.number(),
  tokenPrices: z.record(
    z.string(),
    z.object({
      source: z.string(),
      tokenPriceUsd: z.number(),
    })
  ),
});

// Sample data validation schemas
export const sampleObservationsSchema = z.object({
  [ObservationType.WALLET_BALANCES]: z.array(
    z.object({
      address: z.string(),
      balances: z.object({
        ETH: z.string(),
        USDC: z.string(),
        WETH: z.string(),
      }),
    })
  ),
  [ObservationType.PRICE_DATA]: z.array(
    z.object({
      pair: z.string(),
      price: z.string(),
      timestamp: z.number(),
    })
  ),
  [ObservationType.GAME_EVENT]: z.array(
    z.object({
      type: z.string(),
      details: z.string(),
    })
  ),
});

// Update the existing observation message schema to use these
export const observationMessageContentSchema = z.object({
  timestamp: z.number(),
  roomId: z.number(),
  roundId: z.number(),
  agentId: z.number(),
  observationType: z.nativeEnum(ObservationType),
  data: z.any(),
  // data: z.union([
  //   observationWalletBalanceDataSchema,
  //   observationPriceDataSchema,
  //   z.object({
  //     type: z.string(),
  //     details: z.string(),
  //   }),
  // ]),
});

export const observationMessageInputSchema = authenticatedMessageSchema.extend({
  messageType: z.literal('observation'),
  content: observationMessageContentSchema,
});

// Type exports
export type ObservationWalletBalanceData = z.infer<typeof observationWalletBalanceDataSchema>;
export type ObservationPriceData = z.infer<typeof observationPriceDataSchema>;
export type ObservationMessageContent = z.infer<typeof observationMessageContentSchema>;
export type ObservationMessage = z.infer<typeof observationMessageInputSchema>;

// Only difference between input and output is that the output message will be signed by GM
export const observationMessageAgentOutputSchema = observationMessageInputSchema; // Message sent to agents
export const observationMessageAiChatOutputSchema = observationMessageInputSchema; // Message sent to player facing AI Chatexport interface ObservationWalletBalanceData {
  walletBalances: {
    [walletAddress: string]: {
      nativeBalance: BigInt;
      tokenBalances: { [tokenAddress: string]: BigInt; };
    };
  };
export interface ObservationPriceData {
  nativePrice: number;
  tokenPrices: {
    [tokenAddress: string]: {
      source: string;
      tokenPriceUsd: number;
    };
  };
}
}

