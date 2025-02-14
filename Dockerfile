# Use Node.js base image
FROM node:20-slim

# Install bun
RUN npm install -g bun

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies using bun
RUN bun install

# Copy source code
COPY . .

# Ensure src directory exists and contains all source files
RUN if [ -f "contract-event-listener.ts" ]; then mv contract-event-listener.ts src/; fi

# Build TypeScript code
RUN bun run build

# Expose the port from env (default 3000)
EXPOSE 3000

# Set environment variables
ENV SUPABASE_URL=""
ENV SUPABASE_ANON_KEY=""
ENV SUPABASE_SERVICE_ROLE_KEY=""
ENV SUPABASE_JWT_SECRET=""
ENV SUPABASE_PROJECT_ID=""
ENV PORT=3000
ENV CDP_API_KEY_NAME=""
ENV CDP_API_KEY_PRIVATE_KEY=""
ENV OPENAI_API_KEY=""
ENV NETWORK_ID="base-sepolia"
ENV ANTHROPIC_API_KEY=""
ENV OPENROUTER_API_KEY=""
ENV SIGNER_PRIVATE_KEY=""
ENV APPLICATION_CONTRACT_ADDRESS="0x9b6eA75cA1c0dA7693404CB804E2e56753A36e40"
ENV BASE_SEPOLIA_RPC_URL=""

# Start the application
CMD ["bun", "start"] 