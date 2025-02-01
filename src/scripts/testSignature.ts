import { ethers } from 'ethers';

const API_URL = 'http://localhost:3000';

async function testProtectedEndpoint() {
  // Generate a random wallet
  const wallet = ethers.Wallet.createRandom();
  console.log('Using test wallet address:', wallet.address);

  // Prepare the request body
  const body = {
    account: wallet.address,
    timestamp: Date.now(),
    data: { test: 'Hello World' }, // Additional data
  };

  // Sign the message (entire body)
  const signature = await wallet.signMessage(JSON.stringify(body));

  // Make the request
  const response = await fetch(`${API_URL}/protected-hello`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-authorization-signature': signature,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Request failed:', error);
    return;
  }

  const data = await response.json();
  console.log('Response:', data);
  console.log('Verification successful!');
}

// Run the test
testProtectedEndpoint().catch(console.error);
