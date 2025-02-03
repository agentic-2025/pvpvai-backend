export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agents: {
        Row: {
          character_card: string | null
          color: string
          created_at: string
          creator_id: number
          display_name: string
          endpoint: string
          eth_wallet_address: string | null
          id: number
          image_url: string | null
          last_health_check: string | null
          platform: string
          single_sentence_summary: string | null
          sol_wallet_address: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          character_card?: string | null
          color: string
          created_at?: string
          creator_id: number
          display_name: string
          endpoint: string
          eth_wallet_address?: string | null
          id?: number
          image_url?: string | null
          last_health_check?: string | null
          platform: string
          single_sentence_summary?: string | null
          sol_wallet_address?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          character_card?: string | null
          color?: string
          created_at?: string
          creator_id?: number
          display_name?: string
          endpoint?: string
          eth_wallet_address?: string | null
          id?: number
          image_url?: string | null
          last_health_check?: string | null
          platform?: string
          single_sentence_summary?: string | null
          sol_wallet_address?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      game_masters: {
        Row: {
          agent_role: string | null
          character_card: string | null
          color: string | null
          created_on: string
          display_name: string | null
          eth_wallet_address: string
          id: number
          image_url: string | null
          last_health_check: string | null
          plugins: Json | null
          sol_wallet_address: string
          status: string | null
          updated_at: string
        }
        Insert: {
          agent_role?: string | null
          character_card?: string | null
          color?: string | null
          created_on?: string
          display_name?: string | null
          eth_wallet_address: string
          id?: number
          image_url?: string | null
          last_health_check?: string | null
          plugins?: Json | null
          sol_wallet_address: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          agent_role?: string | null
          character_card?: string | null
          color?: string | null
          created_on?: string
          display_name?: string | null
          eth_wallet_address?: string
          id?: number
          image_url?: string | null
          last_health_check?: string | null
          plugins?: Json | null
          sol_wallet_address?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      room_agents: {
        Row: {
          agent_id: number
          agent_type: string | null
          created_at: string
          id: number
          room_id: number
          updated_at: string
          wallet_address: string | null
          wallet_json: Json | null
        }
        Insert: {
          agent_id: number
          agent_type?: string | null
          created_at?: string
          id?: number
          room_id: number
          updated_at?: string
          wallet_address?: string | null
          wallet_json?: Json | null
        }
        Update: {
          agent_id?: number
          agent_type?: string | null
          created_at?: string
          id?: number
          room_id?: number
          updated_at?: string
          wallet_address?: string | null
          wallet_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "room_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_agents_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          ai_chat_fee: number
          created_at: string
          description: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          ai_chat_fee?: number
          created_at?: string
          description?: string | null
          id?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          ai_chat_fee?: number
          created_at?: string
          description?: string | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rooms: {
        Row: {
          active: boolean
          chain_family: string
          chain_id: number
          color: string | null
          contract_address: string | null
          created_at: string
          creator_id: number
          game_master_action_log: Json | null
          game_master_id: number | null
          id: number
          image_url: string | null
          name: string
          participants: number
          pvp_action_log: Json | null
          room_config: Json | null
          round_ends_on: string | null
          round_time: number | null
          type_id: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          chain_family: string
          chain_id: number
          color?: string | null
          contract_address?: string | null
          created_at?: string
          creator_id: number
          game_master_action_log?: Json | null
          game_master_id?: number | null
          id?: number
          image_url?: string | null
          name: string
          participants?: number
          pvp_action_log?: Json | null
          room_config?: Json | null
          round_ends_on?: string | null
          round_time?: number | null
          type_id: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          chain_family?: string
          chain_id?: number
          color?: string | null
          contract_address?: string | null
          created_at?: string
          creator_id?: number
          game_master_action_log?: Json | null
          game_master_id?: number | null
          id?: number
          image_url?: string | null
          name?: string
          participants?: number
          pvp_action_log?: Json | null
          room_config?: Json | null
          round_ends_on?: string | null
          round_time?: number | null
          type_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_game_master_id_fkey"
            columns: ["game_master_id"]
            isOneToOne: false
            referencedRelation: "game_masters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      round_agent_messages: {
        Row: {
          agent_id: number
          created_at: string
          id: number
          message: Json
          message_type: string | null
          original_author: number | null
          pvp_status_effects: Json | null
          round_id: number
          updated_at: string
        }
        Insert: {
          agent_id: number
          created_at?: string
          id?: number
          message: Json
          message_type?: string | null
          original_author?: number | null
          pvp_status_effects?: Json | null
          round_id: number
          updated_at?: string
        }
        Update: {
          agent_id?: number
          created_at?: string
          id?: number
          message?: Json
          message_type?: string | null
          original_author?: number | null
          pvp_status_effects?: Json | null
          round_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_agent_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_agent_messages_original_author_fkey"
            columns: ["original_author"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_agent_messages_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_agents: {
        Row: {
          agent_id: number
          created_at: string
          id: number
          kicked: boolean
          last_message: string | null
          mute_until: string | null
          outcome: Json | null
          round_id: number
          updated_at: string
        }
        Insert: {
          agent_id: number
          created_at?: string
          id?: number
          kicked?: boolean
          last_message?: string | null
          mute_until?: string | null
          outcome?: Json | null
          round_id: number
          updated_at?: string
        }
        Update: {
          agent_id?: number
          created_at?: string
          id?: number
          kicked?: boolean
          last_message?: string | null
          mute_until?: string | null
          outcome?: Json | null
          round_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_agents_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_observations: {
        Row: {
          content: Json
          created_at: string
          creator: string | null
          id: number
          observation_type: string
          round_id: number
        }
        Insert: {
          content: Json
          created_at?: string
          creator?: string | null
          id?: number
          observation_type: string
          round_id: number
        }
        Update: {
          content?: Json
          created_at?: string
          creator?: string | null
          id?: number
          observation_type?: string
          round_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "round_observations_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_user_messages: {
        Row: {
          connection_id: string | null
          created_at: string
          id: number
          message: Json | null
          round_id: number
          updated_at: string
          user_id: number
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          id?: number
          message?: Json | null
          round_id: number
          updated_at?: string
          user_id: number
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          id?: number
          message?: Json | null
          round_id?: number
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "round_user_messages_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_user_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          active: boolean
          created_at: string
          game_master_action_log: Json | null
          game_master_id: number | null
          id: number
          outcome: Json | null
          pvp_action_log: Json | null
          pvp_status_effects: Json | null
          room_id: number
          round_config: Json | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          game_master_action_log?: Json | null
          game_master_id?: number | null
          id?: number
          outcome?: Json | null
          pvp_action_log?: Json | null
          pvp_status_effects?: Json | null
          room_id: number
          round_config?: Json | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          game_master_action_log?: Json | null
          game_master_id?: number | null
          id?: number
          outcome?: Json | null
          pvp_action_log?: Json | null
          pvp_status_effects?: Json | null
          room_id?: number
          round_config?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_game_master_id_fkey"
            columns: ["game_master_id"]
            isOneToOne: false
            referencedRelation: "game_masters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rooms: {
        Row: {
          created_at: string
          id: number
          room_id: number
          updated_at: string
          user_id: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          room_id: number
          updated_at?: string
          user_id?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          room_id?: number
          updated_at?: string
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_rooms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          address: string
          chain_id: string
          created_at: string
          display_name: string | null
          id: number
          updated_at: string
        }
        Insert: {
          address: string
          chain_id: string
          created_at?: string
          display_name?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          address?: string
          chain_id?: string
          created_at?: string
          display_name?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
