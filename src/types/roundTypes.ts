import { Database, Tables } from './database.types';

// Use type aliases instead of interfaces for database types
export type RoundDataDB = Database['public']['Tables']['rounds']['Row'];
export type RoundParticipantDB = Database['public']['Tables']['round_agents']['Row'] & {
  agents?: {
    display_name: string;
    status: string;
    character_card: string | null;
  };
};

// TODO Might not be needed, round_agent_messages is for rendering AI chat,
// can have a type specific for sending a message to another agent (see agentMessageOutputSchema in schemas.ts, that's the type being sent to agents now)
export type RoundMessageDB = Tables<'round_agent_messages'> & {
  agents?: {
    display_name: string;
    character_card: string | null;
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
