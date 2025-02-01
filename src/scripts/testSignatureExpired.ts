import { ethers } from 'ethers';

const API_URL = 'http://localhost:3000';

async function testExpiredSignature() {
  // Generate a random wallet
  const wallet = ethers.Wallet.createRandom();
  console.log('Using test wallet address:', wallet.address);

  // Create body with timestamp from 6 minutes ago in UTC
  const timestamp = Date.now() - 6 * 60 * 1000;
  const body = {
    account: wallet.address,
    timestamp,
    data: { test: 'Hello World' },
  };

  console.log('Request timestamp:', timestamp);
  console.log('Current time:', Date.now());
  console.log('Time difference:', Date.now() - timestamp);

  const signature = await wallet.signMessage(JSON.stringify(body));

  try {
    const response = await fetch(`${API_URL}/protected-hello`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-authorization-signature': signature,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });
      return;
    }

    const data = await response.json();
    console.log('Response:', data);
  } catch (error) {
    console.error('Network error:', error);
    console.log('Make sure your server is running on http://localhost:3000');
  }
}

testExpiredSignature().catch(console.error);
