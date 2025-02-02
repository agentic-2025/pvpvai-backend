import { customActionProvider, EvmWalletProvider } from '@coinbase/agentkit';
import { hashMessage } from '@coinbase/coinbase-sdk';
import { z } from 'zod';

// Define the prompt for the sign message action
const SIGN_MESSAGE_PROMPT = `
This tool will sign arbitrary messages using EIP-191 Signed Message Standard hashing.
`;

// Define the input schema using Zod
const SignMessageInput = z
  .object({
    message: z.string().describe('The message to sign. e.g. `hello world`'),
  })
  .strip()
  .describe('Instructions for signing a blockchain message');

const signMessageProvider = customActionProvider<EvmWalletProvider>({
  name: 'sign_message',
  description: SIGN_MESSAGE_PROMPT,
  schema: SignMessageInput,
  invoke: async (wallet, args: z.infer<typeof SignMessageInput>): Promise<string> => {
    try {
      const signature = await wallet.signMessage(hashMessage(args.message));
      return `The payload signature ${signature}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to sign message: ${error.message}`);
      }
      throw new Error('Failed to sign message: Unknown error');
    }
  },
});

export { signMessageProvider };
