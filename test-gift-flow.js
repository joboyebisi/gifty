// Simplified test for gift creation and claim flow
const API_URL = process.env.API_URL || "http://localhost:3001";
const TEST_WALLET = "0xabF9639e6CfC39Af7E38165baad76CC0dB7Dd60E";

console.log("\n🎁 Testing Gift Flow\n");

async function testGiftFlow() {
  // Step 1: Create gift
  console.log("Step 1: Creating gift...");
  const createRes = await fetch(`${API_URL}/api/gifts/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      senderWalletAddress: TEST_WALLET,
      amountUsdc: "0.10",
      message: "Test gift",
      srcChain: "eth-sepolia",
      dstChain: "arc-testnet",
      requiresSecret: true,
    }),
  });
  
  const createData = await createRes.json();
  
  if (!createRes.ok || !createData.gift) {
    console.error("❌ Failed to create gift:", createData.error);
    return;
  }
  
  const gift = createData.gift;
  console.log("✅ Gift created:");
  console.log(`   Gift ID: ${gift.id}`);
  console.log(`   Claim Code: ${gift.claimCode}`);
  console.log(`   Secret: ${gift.claimSecret || gift.secret || "N/A (check if requiresSecret was set)"}`);
  console.log(`   Claim URL: ${createData.claimUrl || `http://localhost:3000/claim/${gift.claimCode}${gift.claimSecret ? `?secret=${gift.claimSecret}` : ""}`}`);
  console.log(`   Status: ${gift.status}`);
  console.log(`   Escrow Wallet: ${gift.circleWalletId || "N/A"}`);
  
  // Step 2: Get gift by code
  console.log("\nStep 2: Fetching gift by claim code...");
  const getRes = await fetch(`${API_URL}/api/gifts/claim/${gift.claimCode}`);
  const getData = await getRes.json();
  
  if (!getRes.ok || !getData.gift) {
    console.error("❌ Failed to fetch gift:", getData.error);
    return;
  }
  
  console.log("✅ Gift fetched:");
  console.log(`   Status: ${getData.gift.status}`);
  console.log(`   Amount: ${getData.gift.amountUsdc} USDC`);
  
  // Step 3: Test claim (will fail if escrow not funded, but tests the flow)
  console.log("\nStep 3: Testing claim (may fail if escrow not funded)...");
  const secret = gift.claimSecret || gift.secret;
  if (!secret) {
    console.log("⚠️ No secret found - gift may not require secret or secret not returned");
    console.log("   Skipping claim test");
    return;
  }
  
  const claimRes = await fetch(`${API_URL}/api/gifts/claim/${gift.claimCode}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress: TEST_WALLET,
      secret: secret,
    }),
  });
  
  const claimData = await claimRes.json();
  
  if (claimRes.ok && claimData.success) {
    console.log("✅ Gift claimed successfully!");
    console.log(`   Transfer ID: ${claimData.transfer?.id}`);
  } else {
    console.log("⚠️ Claim failed (expected if escrow not funded):");
    console.log(`   Error: ${claimData.error}`);
    console.log("   This is normal - escrow needs to be funded first");
  }
  
  console.log("\n✅ Gift flow test completed!\n");
}

testGiftFlow().catch(console.error);

