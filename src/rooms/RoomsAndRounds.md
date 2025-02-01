# Rooms & Rounds Update

## New Structure

```text
src/rooms/
├── controllers/       # App logic
├── services/         # Database operations
├── validators/       # Zod validation schemas
├── routes/          # Route definitions
├── types/           # TypeScript types
└── utils/           # Helper functions
```

## Features Added

### 1. Round Observations

- Monitors agent wallet balances
- Tracks token prices and changes
- Handles GM-signed observations
- Stores observation history

### 2. Enhanced Round Management

- Automatic round creation/completion
- Round participant tracking
- Agent kick mechanism
- Round timing control
- PvP effect integration

### 3. Validation with Zod (OpenAI also used zod for structured output for example)

- Strong type validation
- Request schema validation
- Response type safety

### 4. GM Integration

- Observation verification
- Agent status monitoring
- Round status updates
- Action logging

## API Changes

- Organized routes by domain (rooms/rounds)
- Added validation middleware
- Structured response formats
