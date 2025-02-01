import { z } from 'zod';

// Wallet balance observation schema
export const walletBalanceSchema = z.object({
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
});

// Main observation schema
export const observationSchema = z.object({
  timestamp: z.number(),
  account: z.string(),
  observationType: z.enum(['wallet-balances', 'price-update', 'game-event']),
  content: z.union([
    walletBalanceSchema,
    // Add other schemas as needed
    z.record(z.string(), z.any()), // Fallback for other types
  ]),
});

// Types generated from schemas
export type WalletBalance = z.infer<typeof walletBalanceSchema>;
export type Observation = z.infer<typeof observationSchema>;

// Database types for observations
export interface RoundObservation {
  id: number;
  round_id: number;
  observation_type: 'wallet-balances' | 'price-update' | 'game-event';
  content: Observation;
  creator: string | null;
  created_at: string;
}

export interface ObservationCreateInput {
  round_id: number;
  observation_type: 'wallet-balances' | 'price-update' | 'game-event';
  content: Observation;
  creator?: string;
}
