const BankTransferAPI = require("./api/BankTransferAPI");
const receiverApiList = require("./api/ReceiverAPIs");

const senderApi = "https://firestore.googleapis.com/v1/projects/yes-bank-international/databases/(default)/documents";


async function initializeAndTest() {
    console.log("🔵 Initializing bank transfer test...");

    if (!receiverApiList || receiverApiList.length === 0) {
        console.error("❌ No receiver APIs found! Exiting test.");
        return;
    }

    console.log("✅ Receiver APIs loaded:", receiverApiList);

    // const senderApi = "https://firestore.googleapis.com/v1/projects/interbankmanagement/databases/(default)/documents";
    const bankTransfer = new BankTransferAPI(senderApi, receiverApiList);

    await bankTransfer.fetchIFSCs();

    const senderAccount = "10001234";  // Ensure this exists in interbankmanagement lite_profile
    const senderIfsc = "YBI01";
    const receiverAccount = "10002972313"
    const amountToTransfer = 500;

    await bankTransfer.transferMoney(senderAccount, senderIfsc, receiverAccount, amountToTransfer);

    console.log("\n✅ Test completed!");
}

initializeAndTest().catch(error => {
    console.error("❌ Test failed:", error.message);
});