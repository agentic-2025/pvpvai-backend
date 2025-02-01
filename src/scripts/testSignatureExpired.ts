import { ethers } from 'ethers';

const API_URL = 'http://localhost:3000';

async function testExpiredSignature() {
  // Generate a random wallet
  const wallet = ethers.Wallet.createRandom();
  console.log('Using test wallet address:', wallet.address);

  // Create body with timestamp from 6 minutes ago in UTC
  const body = {
    account: wallet.address,
    timestamp: Date.now() - 6 * 60 * 1000,
    data: { test: 'Hello World' },
  };

  const signature = await wallet.signMessage(JSON.stringify(body));

  const response = await fetch(`${API_URL}/protected-hello`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-authorization-signature': signature,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  console.log('Response:', data);
  // Should show an error about expired signature
}

testExpiredSignature().catch(console.error);
