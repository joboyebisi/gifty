/**
 * Gift Claiming Flow Test Script
 * Tests the complete gift claiming flow including onboarding and wallet connection
 * 
 * Usage: node test-claim-flow.js [claimCode] [secret]
 */

const API_URL = process.env.API_URL || "http://localhost:3001";

// Test configuration
const TEST_CONFIG = {
  claimCode: process.argv[2] || "TEST123",
  secret: process.argv[3] || "test-secret",
  walletAddress: process.argv[4] || "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb", // Test wallet
};

console.log("🧪 Gift Claiming Flow Test\n");
console.log("Configuration:");
console.log(`  Claim Code: ${TEST_CONFIG.claimCode}`);
console.log(`  Secret: ${TEST_CONFIG.secret}`);
console.log(`  Wallet Address: ${TEST_CONFIG.walletAddress}`);
console.log(`  API URL: ${API_URL}\n`);

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function logTest(name, passed, message = "") {
  const status = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${status}: ${name}${message ? ` - ${message}` : ""}`);
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

// Test 1: Check if gift exists (without wallet)
async function testGiftExists() {
  try {
    const url = `${API_URL}/api/gifts/claim/${TEST_CONFIG.claimCode}${TEST_CONFIG.secret ? `?secret=${TEST_CONFIG.secret}` : ""}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok && data.gift) {
      logTest("Test 1: Gift exists and can be fetched", true, `Amount: ${data.gift.amountUsdc} USDC`);
      return data.gift;
    } else {
      logTest("Test 1: Gift exists and can be fetched", false, data.error || "Gift not found");
      return null;
    }
  } catch (error) {
    logTest("Test 1: Gift exists and can be fetched", false, error.message);
    return null;
  }
}

// Test 2: Check gift status
async function testGiftStatus(gift) {
  if (!gift) {
    logTest("Test 2: Gift status check", false, "No gift to check");
    return false;
  }
  
  const isPending = gift.status === "pending";
  const isClaimed = gift.status === "claimed";
  const isExpired = gift.status === "expired";
  
  if (isPending) {
    logTest("Test 2: Gift status check", true, "Gift is pending (ready to claim)");
    return true;
  } else if (isClaimed) {
    logTest("Test 2: Gift status check", false, "Gift already claimed");
    return false;
  } else if (isExpired) {
    logTest("Test 2: Gift status check", false, "Gift has expired");
    return false;
  } else {
    logTest("Test 2: Gift status check", false, `Unknown status: ${gift.status}`);
    return false;
  }
}

// Test 3: Check escrow funding
async function testEscrowFunding(gift) {
  if (!gift) {
    logTest("Test 3: Escrow funding check", false, "No gift to check");
    return false;
  }
  
  if (!gift.circleWalletId) {
    logTest("Test 3: Escrow funding check", false, "No escrow wallet ID");
    return false;
  }
  
  if (gift.transferStatus === "escrow_funded") {
    logTest("Test 3: Escrow funding check", true, "Escrow is funded");
    return true;
  } else {
    logTest("Test 3: Escrow funding check", false, `Escrow status: ${gift.transferStatus || "unknown"}`);
    return false;
  }
}

// Test 4: Test claim execution (without actually claiming if already claimed)
async function testClaimExecution(gift) {
  if (!gift) {
    logTest("Test 4: Claim execution endpoint", false, "No gift to claim");
    return false;
  }
  
  if (gift.status === "claimed") {
    logTest("Test 4: Claim execution endpoint", false, "Gift already claimed - skipping actual claim");
    return false;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/gifts/claim/${TEST_CONFIG.claimCode}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: TEST_CONFIG.walletAddress,
        secret: TEST_CONFIG.secret || undefined,
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      logTest("Test 4: Claim execution endpoint", true, `Transfer ID: ${data.transfer?.id || "N/A"}`);
      return true;
    } else {
      logTest("Test 4: Claim execution endpoint", false, data.error || "Claim failed");
      return false;
    }
  } catch (error) {
    logTest("Test 4: Claim execution endpoint", false, error.message);
    return false;
  }
}

// Test 5: Verify claim was successful
async function testClaimVerification() {
  try {
    const url = `${API_URL}/api/gifts/claim/${TEST_CONFIG.claimCode}${TEST_CONFIG.secret ? `?secret=${TEST_CONFIG.secret}` : ""}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok && data.gift) {
      if (data.gift.status === "claimed") {
        logTest("Test 5: Claim verification", true, "Gift successfully claimed");
        return true;
      } else {
        logTest("Test 5: Claim verification", false, `Gift status: ${data.gift.status}`);
        return false;
      }
    } else {
      logTest("Test 5: Claim verification", false, data.error || "Could not verify claim");
      return false;
    }
  } catch (error) {
    logTest("Test 5: Claim verification", false, error.message);
    return false;
  }
}

// Test 6: Check backend account creation endpoint
async function testAccountCreation() {
  try {
    const queryParams = new URLSearchParams({
      walletAddress: TEST_CONFIG.walletAddress,
    });
    
    const response = await fetch(`${API_URL}/api/users/me?${queryParams.toString()}`);
    const data = await response.json();
    
    if (response.ok && data.user) {
      logTest("Test 6: Account creation endpoint", true, `User ID: ${data.user.id}`);
      return true;
    } else {
      logTest("Test 6: Account creation endpoint", false, data.error || "Account creation failed");
      return false;
    }
  } catch (error) {
    logTest("Test 6: Account creation endpoint", false, error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log("Starting tests...\n");
  
  // Test 1: Check if gift exists
  const gift = await testGiftExists();
  console.log("");
  
  // Test 2: Check gift status
  const canClaim = await testGiftStatus(gift);
  console.log("");
  
  // Test 3: Check escrow funding
  await testEscrowFunding(gift);
  console.log("");
  
  // Test 6: Test account creation (doesn't require gift)
  await testAccountCreation();
  console.log("");
  
  // Test 4 & 5: Only run if gift can be claimed
  if (canClaim && gift) {
    // Test 4: Execute claim
    const claimSuccess = await testClaimExecution(gift);
    console.log("");
    
    // Test 5: Verify claim (wait a bit for processing)
    if (claimSuccess) {
      console.log("⏳ Waiting 2 seconds for claim to process...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      await testClaimVerification();
      console.log("");
    }
  } else {
    console.log("⏭️  Skipping claim execution tests (gift not claimable)\n");
  }
  
  // Print summary
  console.log("=".repeat(50));
  console.log("Test Summary");
  console.log("=".repeat(50));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📊 Total: ${results.tests.length}`);
  console.log("");
  
  if (results.failed === 0) {
    console.log("🎉 All tests passed!");
    process.exit(0);
  } else {
    console.log("⚠️  Some tests failed. Review the output above.");
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error("❌ Test execution error:", error);
  process.exit(1);
});

