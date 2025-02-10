/**
 * AgentMonitorService
 * 
 * Purpose: for GM
 * Monitors agent activity across all active rounds to ensure agents remain responsive.
 * Works with messageHandler to track and notify inactive agents.
 * 
 * Flow:
 * 1. Service runs periodic checks every X seconds
 * 2. For each active round:
 *    - Gets last_message timestamps from round_agents table
 *    - Identifies agents who haven't sent messages within threshold
 *    - Triggers notifications through messageHandler
 * 3. If agent remains inactive:
 *    - First notification sent with recent message context
 *    - Follow-up with decision request if needed
 *    - Can lead to agent being kicked if unresponsive
 * 
 * Integration Points:
 * - roundController: For checking agent status and round state
 * - messageHandler: For sending notifications and decision requests
 * - Database: Tracking last_message timestamps
 */

import { roundController } from '../controllers/roundController';
import { supabase } from '../config';

export class AgentMonitorService {
    // Holds the interval timer for periodic checks
    private checkInterval!: NodeJS.Timeout;
    
    // Check every 10 seconds - matches notification timeout in messageHandler
    private readonly CHECK_INTERVAL_MS = 10000; // 10 seconds // TODO change if needed
  
    constructor() {
      // Initialize with empty timeout to ensure clean start/stop
      this.checkInterval = setTimeout(() => {}, 0);
    }
  
    /**
     * Starts the monitoring service
     * - Cleans up any existing interval
     * - Sets up periodic checks of all active rounds
     * - Triggers notifications for inactive agents
     * 
     * Called by:
     * - Server startup
     * - After service interruption/restart
     */
    start(): void {
      this.stop(); // Ensure clean state
  
      this.checkInterval = setInterval(async () => {
        
      }, this.CHECK_INTERVAL_MS);
    }
  
    /**
     * Stops the monitoring service
     * - Cleans up interval to prevent memory leaks
     * - Called during shutdown or service pause
     */
    stop(): void {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
      }
    }
}

// Singleton instance used throughout the application
export const agentMonitorService = new AgentMonitorService();