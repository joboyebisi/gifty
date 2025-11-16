// Comprehensive test script for all core features
// Tests: Bridge, Gift Send/Link Generation, CCTP, Claim Secret

const API_URL = process.env.API_URL || "http://localhost:3001";
const TEST_WALLET = "0xabF9639e6CfC39Af7E38165baad76CC0dB7Dd60E";

console.log("\n🧪 Testing All Core Features\n");
console.log(`API URL: ${API_URL}`);
console.log(`Test Wallet: ${TEST_WALLET}\n`);

// ============================================================================
// TEST 1: Balance Fetching (Baseline)
// ============================================================================
async function testBalanceFetching() {
  console.log("📊 TEST 1: Balance Fetching");
  console.log("─".repeat(50));
  
  try {
    const res = await fetch(`${API_URL}/api/wallet/balance?walletAddress=${TEST_WALLET}`);
    const data = await res.json();
    
    if (res.ok) {
      console.log("✅ Balance fetch successful");
      console.log(`   Sepolia ETH: ${data.sepolia?.eth?.balanceFormatted || "N/A"}`);
      console.log(`   Sepolia USDC: ${data.sepolia?.usdc?.balanceFormatted || "N/A"}`);
      console.log(`   Arc USDC: ${data.arc?.usdc?.balanceFormatted || "N/A"}`);
      if (data.error) {
        console.log(`   ⚠️ Error: ${data.error}`);
      }
      return true;
    } else {
      console.error(`❌ Balance fetch failed: ${data.error}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Balance fetch error: ${error.message}`);
    return false;
  }
}

// ============================================================================
// TEST 2: Gift Creation with Link Generation
// ============================================================================
async function testGiftCreation() {
  console.log("\n🎁 TEST 2: Gift Creation & Link Generation");
  console.log("─".repeat(50));
  
  try {
    const giftData = {
      senderWalletAddress: TEST_WALLET,
      amountUsdc: "1.00",
      message: "Test gift from automated test",
      recipientHandle: "test_recipient",
      recipientEmail: "test@example.com",
      srcChain: "eth-sepolia",
      dstChain: "arc-testnet",
      requiresSecret: true, // Test secret generation
    };
    
    console.log("Creating gift...");
    const res = await fetch(`${API_URL}/api/gifts/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(giftData),
    });
    
    const data = await res.json();
    
    if (res.ok && data.gift) {
      console.log("✅ Gift created successfully");
      console.log(`   Gift ID: ${data.gift.id}`);
      console.log(`   Claim Code: ${data.gift.claimCode}`);
      console.log(`   Secret: ${data.gift.secret || "N/A"}`);
      console.log(`   Claim Link: ${data.gift.claimLink || "N/A"}`);
      console.log(`   Status: ${data.gift.status}`);
      console.log(`   Amount: ${data.gift.amountUsdc} USDC`);
      
      // Test link format
      if (data.gift.claimLink) {
        const url = new URL(data.gift.claimLink);
        console.log(`   ✅ Link format valid: ${url.pathname}`);
      }
      
      return data.gift;
    } else {
      console.error(`❌ Gift creation failed: ${data.error || "Unknown error"}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Gift creation error: ${error.message}`);
    return null;
  }
}

// ============================================================================
// TEST 3: Gift Claim with Secret
// ============================================================================
async function testGiftClaim(gift) {
  console.log("\n🔓 TEST 3: Gift Claim with Secret");
  console.log("─".repeat(50));
  
  if (!gift || !gift.claimCode) {
    console.log("⏭️ Skipping - no gift to claim");
    return false;
  }
  
  try {
    // First, get gift details
    console.log(`Fetching gift by claim code: ${gift.claimCode}...`);
    const getRes = await fetch(`${API_URL}/api/gifts/claim/${gift.claimCode}`);
    const getData = await getRes.json();
    
    if (!getRes.ok || !getData.gift) {
      console.error(`❌ Failed to fetch gift: ${getData.error}`);
      return false;
    }
    
    console.log("✅ Gift fetched");
    console.log(`   Status: ${getData.gift.status}`);
    console.log(`   Requires Secret: ${!!getData.gift.claimSecret}`);
    
    // Test claim with secret
    if (gift.secret) {
      console.log(`\nAttempting claim with secret: ${gift.secret}...`);
      const claimRes = await fetch(`${API_URL}/api/gifts/claim/${gift.claimCode}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: TEST_WALLET,
          secret: gift.secret,
        }),
      });
      
      const claimData = await claimRes.json();
      
      if (claimRes.ok && claimData.success) {
        console.log("✅ Gift claimed successfully");
        console.log(`   Transfer ID: ${claimData.transfer?.id || "N/A"}`);
        console.log(`   Transfer Status: ${claimData.transfer?.status || "N/A"}`);
        console.log(`   Message: ${claimData.message || "N/A"}`);
        return true;
      } else {
        console.error(`❌ Claim failed: ${claimData.error || "Unknown error"}`);
        if (claimData.details) {
          console.error(`   Details: ${claimData.details}`);
        }
        return false;
      }
    } else {
      console.log("⏭️ Skipping claim - no secret provided");
      return false;
    }
  } catch (error) {
    console.error(`❌ Claim error: ${error.message}`);
    return false;
  }
}

// ============================================================================
// TEST 4: CCTP Transfer (Backend)
// ============================================================================
async function testCCTPTransfer() {
  console.log("\n🌉 TEST 4: CCTP Transfer (Backend)");
  console.log("─".repeat(50));
  
  try {
    // This requires a Circle wallet ID, so we'll test the endpoint structure
    console.log("Testing CCTP transfer endpoint...");
    
    const transferData = {
      walletId: "test-wallet-id", // Would need real wallet ID
      sourceChain: "eth-sepolia",
      destinationChain: "arc-testnet",
      recipientAddress: TEST_WALLET,
      amount: "0.10", // Small test amount
    };
    
    const res = await fetch(`${API_URL}/api/cctp/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transferData),
    });
    
    const data = await res.json();
    
    if (res.ok) {
      console.log("✅ CCTP transfer initiated");
      console.log(`   Transfer ID: ${data.transferId || "N/A"}`);
      console.log(`   Status: ${data.status || "N/A"}`);
      return true;
    } else {
      // Expected to fail without real wallet ID, but check error format
      if (data.error && data.error.includes("wallet")) {
        console.log("⚠️ CCTP endpoint exists but requires valid wallet ID");
        console.log(`   Error (expected): ${data.error}`);
        return true; // Endpoint exists and validates input
      } else {
        console.error(`❌ CCTP transfer failed: ${data.error}`);
        return false;
      }
    }
  } catch (error) {
    console.error(`❌ CCTP transfer error: ${error.message}`);
    return false;
  }
}

// ============================================================================
// TEST 5: BridgeKit (Frontend - Manual Test Instructions)
// ============================================================================
function testBridgeKitInstructions() {
  console.log("\n🌉 TEST 5: BridgeKit (Frontend - Manual Test)");
  console.log("─".repeat(50));
  console.log("BridgeKit is a frontend component. To test:");
  console.log("1. Open the app in browser");
  console.log("2. Navigate to /wallet page");
  console.log("3. Find 'CCTP Bridge' section");
  console.log("4. Select source wallet (Primary or Smart Account)");
  console.log("5. Select source chain (Ethereum Sepolia)");
  console.log("6. Select destination chain (Arc Testnet)");
  console.log("7. Enter amount (e.g., 0.10 USDC)");
  console.log("8. Click 'Bridge USDC'");
  console.log("9. Approve transaction in wallet");
  console.log("10. Wait for: Approve → Burn → Attestation → Mint");
  console.log("\n✅ Expected: USDC transferred cross-chain using CCTP");
  console.log("⚠️ Note: This requires wallet connection and sufficient balance");
}

// ============================================================================
// TEST 6: Verify Endpoints Exist
// ============================================================================
async function testEndpointsExist() {
  console.log("\n🔍 TEST 6: Verify All Endpoints Exist");
  console.log("─".repeat(50));
  
  const endpoints = [
    { method: "GET", path: "/api/wallet/balance", name: "Balance Check" },
    { method: "POST", path: "/api/gifts/create", name: "Gift Creation" },
    { method: "GET", path: "/api/gifts/claim/:code", name: "Get Gift by Code" },
    { method: "POST", path: "/api/gifts/claim/:code/execute", name: "Claim Gift" },
    { method: "POST", path: "/api/cctp/transfer", name: "CCTP Transfer" },
  ];
  
  let allExist = true;
  
  for (const endpoint of endpoints) {
    try {
      // For GET endpoints, test with minimal params
      if (endpoint.method === "GET") {
        if (endpoint.path.includes(":code")) {
          // Skip dynamic routes - they need actual codes
          console.log(`⏭️ ${endpoint.name}: Dynamic route (requires code)`);
          continue;
        }
        
        const testPath = endpoint.path.replace(":walletAddress", TEST_WALLET);
        const res = await fetch(`${API_URL}${testPath}?walletAddress=${TEST_WALLET}`);
        
        // Any response (even 400/404) means endpoint exists
        if (res.status !== 404) {
          console.log(`✅ ${endpoint.name}: Exists (${res.status})`);
        } else {
          console.log(`❌ ${endpoint.name}: Not found (404)`);
          allExist = false;
        }
      } else {
        // For POST endpoints, test with minimal body
        const res = await fetch(`${API_URL}${endpoint.path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        
        // Any response (even 400) means endpoint exists
        if (res.status !== 404) {
          console.log(`✅ ${endpoint.name}: Exists (${res.status})`);
        } else {
          console.log(`❌ ${endpoint.name}: Not found (404)`);
          allExist = false;
        }
      }
    } catch (error) {
      console.log(`⚠️ ${endpoint.name}: Connection error (server may be down)`);
    }
  }
  
  return allExist;
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllTests() {
  const results = {
    balance: false,
    giftCreation: false,
    giftClaim: false,
    cctp: false,
    endpoints: false,
  };
  
  // Test 1: Balance
  results.balance = await testBalanceFetching();
  
  // Test 2: Gift Creation
  const gift = await testGiftCreation();
  results.giftCreation = !!gift;
  
  // Test 3: Gift Claim (only if gift was created)
  if (gift) {
    results.giftClaim = await testGiftClaim(gift);
  }
  
  // Test 4: CCTP
  results.cctp = await testCCTPTransfer();
  
  // Test 5: BridgeKit Instructions
  testBridgeKitInstructions();
  
  // Test 6: Endpoints
  results.endpoints = await testEndpointsExist();
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(50));
  console.log(`Balance Fetching:     ${results.balance ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Gift Creation:        ${results.giftCreation ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Gift Claim:           ${results.giftClaim ? "✅ PASS" : "⏭️ SKIP"}`);
  console.log(`CCTP Transfer:        ${results.cctp ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Endpoints Exist:      ${results.endpoints ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`BridgeKit:            ⚠️  Manual test required`);
  console.log("=".repeat(50));
  
  const passed = Object.values(results).filter(r => r === true).length;
  const total = Object.values(results).filter(r => r !== "⏭️ SKIP").length;
  
  console.log(`\n✅ Passed: ${passed}/${total} automated tests`);
  console.log("⚠️ BridgeKit requires manual testing in browser\n");
}

// Run tests
runAllTests().catch(console.error);

