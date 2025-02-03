import { Wallet } from 'ethers';
import { backendEthersSigningWallet, supabase } from '../../config';
import { Tables } from '../../types/database.types';
export const signMessage = async (
  messageContent: any,
  wallet: Wallet = backendEthersSigningWallet
): Promise<string> => {
  const timestamp = Date.now();
  // Combine timestamp and message into a single string
  const messageString = JSON.stringify({
    content: messageContent,
  });

  // Sign the message using ethers
  const signature = await wallet.signMessage(messageString);

  return signature;
};

export async function roundPreflight(roundId: number): Promise<{
  round?: Tables<'rounds'>;
  roundAgents?: Tables<'round_agents'>[];
  agents?: Tables<'agents'>[];
  valid: boolean;
  reason?: string;
}> {
  const { data: roundData, error: roundError } = await supabase
    .from('rounds')
    .select(
      `*,
      round_agents(*,
        agents(*)
      )`
    )
    .eq('id', roundId)
    .eq('round_agents.kicked', false)
    .single();
  if (roundError) {
    console.error('Error fetching round:', roundError);
    return { valid: false, reason: 'Error fetching round from supabase: ' + roundError?.message };
  }
  if (!roundData) {
    return { valid: false, reason: 'Round not found' };
  }
  if (!roundData.active) {
    return { valid: false, reason: 'Round is not active' };
  }
  return {
    valid: true,
    round: roundData,
    roundAgents: roundData.round_agents,
    agents: roundData.round_agents.map((roundAgent) => roundAgent.agents),
  };
} // Checks if an agent is a valid target for a message

export async function agentPreflight(
  agentId: number,
  roundId: number
): Promise<{
  agent?: Partial<Tables<'agents'>>;
  valid: boolean;
  reason?: string;
}> {
  const { data: agentData, error: agentError } = await supabase
    .from('agents')
    .select(
      `endpoint, status, round_agents!inner(
        kicked
        )`
    )
    .eq('id', agentId)
    .eq('round_agents.round_id', roundId)
    .single();
  if (agentError) {
    if (agentError.code === 'PGRST106') {
      return {
        valid: false,
        reason: `Agent ${agentId} doesn't exist, or round ${roundId} doesn't exist, or agent ${agentId} is not in round ${roundId}`,
      };
    }
    console.error('Error fetching agent endpoint:', agentError);
    return { valid: false, reason: 'Error fetching agent from supabase: ' + agentError?.message };
  }

  // No need to check status, we only check status to determine if we can add an agent to a round.
  // if (agentData.status !== 'Up') {
  //   console.error(`Agent ${agentId} is not active, status: ${agentData.status}`);
  //   return {valid: false, reason: `Agent ${agentId} is not active, status: ${agentData.status}`};
  // }
  if (!agentData.round_agents) {
    return { valid: false, reason: `Agent ${agentId} is not in round ${roundId}` };
  }
  if (!agentData.round_agents[0].kicked) {
    return { valid: false, reason: `Agent ${agentId} is kicked from the round` };
  }

  return { valid: true, agent: agentData };
}
