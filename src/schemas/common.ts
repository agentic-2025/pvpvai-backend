import { z } from 'zod';

// First, let's rename the base schema
export const authenticatedMessageSchema = z.object({
  messageType: z.string(), // We'll override this with literals in extending schemas
  signature: z.string(),
  sender: z.string(),
});

// Common schemas
export const validEthereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const signatureSchema = z.string();
export const timestampSchema = z.number().int().positive();
export const transactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
