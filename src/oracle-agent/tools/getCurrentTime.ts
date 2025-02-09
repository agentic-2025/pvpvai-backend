import { CdpAgentkit } from '@coinbase/cdp-agentkit-core';
import { CdpTool } from '@coinbase/cdp-langchain';
import { z } from 'zod';

// Define the prompt for the get current time action
const GET_CURRENT_TIME_PROMPT = `
This tool returns the current time in UTC.
Returns both ISO string format and Unix timestamp in seconds.
`;

// Define the input schema using Zod (empty since we don't need any input)
const GetCurrentTimeInput = z.object({}).strip().describe('No input needed to get current time');

/**
 * Gets the current time in UTC
 */
async function getCurrentTime(): Promise<string> {
  try {
    const now = new Date();
    const unixTimestamp = Math.floor(now.getTime() / 1000);

    return JSON.stringify(
      {
        iso: now.toISOString(),
        timestamp: unixTimestamp,
      },
      null,
      2
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get current time: ${error.message}`);
    }
    throw new Error('Failed to get current time: Unknown error');
  }
}

const getCurrentTimeTool = (agentkit: CdpAgentkit) => {
  return new CdpTool(
    {
      name: 'get_current_time',
      description: GET_CURRENT_TIME_PROMPT,
      argsSchema: GetCurrentTimeInput,
      func: getCurrentTime,
    },
    agentkit
  );
};

export default getCurrentTimeTool; 