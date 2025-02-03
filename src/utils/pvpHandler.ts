import { applyPvp } from '../pvp';

export interface PvPResult {
  message: any | null;
  targets: number[];
  actions?: {
    type: string;
    source: number;
    target: number;
    effect: any;
  }[];
}

export interface PvPAction {
  type: string;
  source: number;
  target: number;
  effect: any;
}

export async function handlePvPEffects(
  message: any,
  sourceAgentId: number,
  targetAgentIds: number[]
): Promise<PvPResult> {
  try {
    const pvpResult = await applyPvp(message, sourceAgentId, targetAgentIds);

    return {
      message: pvpResult.message,
      targets: pvpResult.targets || targetAgentIds,
      actions: pvpResult.actions || [], // Provide default empty array
    };
  } catch (error) {
    console.error('Error applying PvP effects:', error);
    return {
      message: message,
      targets: targetAgentIds,
      actions: [], // Provide default empty array in error case too
    };
  }
}

export function shouldBlockMessage(pvpResult: PvPResult): boolean {
  return pvpResult.message === null;
}

export function getModifiedTargets(pvpResult: PvPResult, originalTargets: number[]): number[] {
  return pvpResult.targets.length > 0 ? pvpResult.targets : originalTargets;
}

// Helper functions for common PvP checks
export function hasPvPEffect(actions: PvPAction[], type: string, target: number): boolean {
  return actions?.some((action) => action.type === type && action.target === target) || false;
}

export function isSilenced(actions: PvPAction[], agentId: number): boolean {
  return hasPvPEffect(actions, 'silence', agentId);
}

export function isDeafened(actions: PvPAction[], agentId: number): boolean {
  return hasPvPEffect(actions, 'deafen', agentId);
}

export function isPoisoned(actions: PvPAction[], agentId: number): boolean {
  return hasPvPEffect(actions, 'poison', agentId);
}
