/*
  Functions that combine data fetching and validation. Used in message processing.
  All functions here are a bit redundant w/ services.
*/
import { supabase } from '../config';
import { Tables } from '../types/database.types';

// Checks if a round is valid for a message and returns the round data
// Currently used by public chat
// A round is a valid target if:
// - It exists
// - It is active
export async function roundPreflight(roundId: number): Promise<
  | {
      round: Tables<'rounds'>;
      valid: true;
      reason: '';
    }
  | {
      round: undefined;
      valid: false;
      reason: string;
    }
> {
  const { data: roundData, error: roundError } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', roundId)
    .single();
  if (roundError) {
    if (roundError.code === 'PGRST106') {
      return { round: undefined, valid: false, reason: 'Round not found' };
    }
    console.error('Error fetching round:', roundError);
    return {
      round: undefined,
      valid: false,
      reason: 'Error fetching round from supabase: ' + roundError?.message,
    };
  }
  if (!roundData.active) {
    return { round: undefined, valid: false, reason: 'Round is not active' };
  }
  return { round: roundData, valid: true, reason: '' };
}

// Checks if a round is a valid target for a message and returns all valid agents in the round
// Used to on Agent -> Backend -> Agent messages to fetch all of the non-kicked agents before applying PvP
// Function is redundant.
// A round is valid if:
// - It exists
// - It is active
// - It has agents
// Agents who are kicked will be filtered out
export async function roundAndAgentsPreflight(roundId: number): Promise<
  | {
      round: Tables<'rounds'>;
      roundAgents: Tables<'round_agents'>[];
      agents: Tables<'agents'>[];
      valid: true;
      reason: '';
    }
  | {
      round: undefined;
      roundAgents: undefined;
      agents: undefined;
      valid: false;
      reason: string;
    }
> {
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
    return {
      round: undefined,
      roundAgents: undefined,
      agents: undefined,
      valid: false,
      reason: 'Error fetching round from supabase: ' + roundError?.message,
    };
  }
  if (!roundData) {
    return {
      round: undefined,
      roundAgents: undefined,
      agents: undefined,
      valid: false,
      reason: 'Round not found',
    };
  }
  if (!roundData.active) {
    return {
      round: undefined,
      roundAgents: undefined,
      agents: undefined,
      valid: false,
      reason: 'Round is not active',
    };
  }

  return {
    valid: true,
    round: roundData,
    roundAgents: roundData.round_agents,
    agents: roundData.round_agents.map((roundAgent) => roundAgent.agents),
    reason: '',
  };
}

// Checks if a single agent is a valid target for a message for a given round and returns the agent data
// An agent is valid if:
// - It exists
// - It is in the round
// - It is not kicked in the round
export async function agentPreflight(
  agentId: number,
  roundId: number
): Promise<
  | {
      agent: Partial<Tables<'agents'>>;
      valid: true;
      reason: '';
    }
  | {
      agent: undefined;
      valid: false;
      reason: string;
    }
> {
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
        agent: undefined,
        valid: false,
        reason: `Agent ${agentId} doesn't exist, or round ${roundId} doesn't exist, or agent ${agentId} is not in round ${roundId}`,
      };
    }
    console.error('Error fetching agent endpoint:', agentError);
    return {
      agent: undefined,
      valid: false,
      reason: 'Error fetching agent from supabase: ' + agentError?.message,
    };
  }

  // No need to check status, we only check status to determine if we can add an agent to a round.
  // if (agentData.status !== 'Up') {
  //   console.error(`Agent ${agentId} is not active, status: ${agentData.status}`);
  //   return {valid: false, reason: `Agent ${agentId} is not active, status: ${agentData.status}`};
  // }
  if (!agentData.round_agents) {
    return {
      agent: undefined,
      valid: false,
      reason: `Agent ${agentId} is not in round ${roundId}`,
    };
  }
  if (!agentData.round_agents[0].kicked) {
    return {
      agent: undefined,
      valid: false,
      reason: `Agent ${agentId} is kicked from the round`,
    };
  }

  return { valid: true, agent: agentData, reason: '' };
}
