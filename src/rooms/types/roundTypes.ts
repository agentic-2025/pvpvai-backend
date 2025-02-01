import { Database } from '../../types/database.types';

// Use type aliases instead of interfaces for database types
export type RoundDataDB = Database['public']['Tables']['rounds']['Row'];
export type RoundParticipantDB = Database['public']['Tables']['round_agents']['Row'] & {
  agents?: {
    display_name: string;
    status: string;
    character_card: string | null;
  };
};
export type RoundMessageDB = Database['public']['Tables']['round_agent_messages']['Row'] & {
  agents?: {
    display_name: string;
    character_card: string | null;
  };
};
export type GMActionDB = Database['public']['Tables']['round_gm_messages']['Row'] & {
  game_masters?: {
    display_name: string | null;
  };
};

// Additional business logic types
export interface RoundConfig {
  round_duration: number;
  pvp_config: {
    enabled: boolean;
    enabled_rules: string[];
  };
}

export interface BaseRoundOutcome {
  reason?: string;
  timestamp: string;
  data?: any;
}