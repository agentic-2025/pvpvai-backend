// // src/services/gmService.ts

// export class GMService {
//     private isRunning = false;
//     private readonly CHECK_INTERVAL = 5000; // 5 seconds
  
//     async start() {
//       this.isRunning = true;
//       this.pollActiveRounds();
//     }
  
//     private async pollActiveRounds() {
//       while (this.isRunning) {
//         try {
//           const rounds = await this.getActiveRounds();
          
//           for (const round of rounds) {
//             await this.processRound(round);
//           }
  
//           await new Promise(resolve => setTimeout(resolve, this.CHECK_INTERVAL));
//         } catch (error) {
//           console.error('Error in GM round polling:', error);
//         }
//       }
//     }
  
//     private async processRound(round: any) {
//       // Handle round state
//       if (this.isRoundEnded(round)) {
//         await this.sendRoundEndedMessage(round);
//         await this.collectAgentDecisions(round);
//       }
  
//       // Check for inactive agents
//       await this.checkAgentActivity(round);
//     }
  
//     // Additional helper methods...
//   }