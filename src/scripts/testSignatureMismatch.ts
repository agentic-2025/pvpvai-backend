import { ethers } from 'ethers';

const API_URL = 'http://localhost:3000';

async function testSignatureMismatch() {
  // Generate two random wallets
  const signingWallet = ethers.Wallet.createRandom();
  const claimedWallet = ethers.Wallet.createRandom();
  console.log('Signing wallet address:', signingWallet.address);
  console.log('Claimed wallet address:', claimedWallet.address);

  // Create body with mismatched account
  const body = {
    account: claimedWallet.address, // Claim to be a different address
    timestamp: Date.now(),
    data: { test: 'Hello World' },
  };

  // Sign with the first wallet but claim to be the second
  const signature = await signingWallet.signMessage(JSON.stringify(body));

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
  // Should show signature verification failed
}

testSignatureMismatch().catch(console.error); 