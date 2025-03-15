# BankTransferAPI

## Overview

`BankTransferAPI` is a Node.js module designed to handle bank transfers between accounts using Google Firestore as the backend database. It supports account validation, balance updates, and transaction logging across multiple sender and receiver APIs, with a focus on security and reliability through IFSC validation and rollback mechanisms.

### Features

- **Account Validation**: Validates sender and receiver accounts using `bank_account` and `lite_profile` collections.
- **IFSC Validation**: Verifies both sender and receiver IFSC codes against cached `lite_profile` data.
- **Balance Updates**: Updates account balances with partial updates to preserve other fields.
- **Transaction Logging**: Records transactions in `transaction_history` across all receiver APIs.
- **Rollback**: Reverts sender balance if receiver update fails.
- **IFSC Caching**: Preloads IFSC codes for efficient validation.

### Dependencies

- **Node.js**: Runtime environment (v14+ recommended).
- **axios**: HTTP client for Firestore API requests (`npm install axios`).

## Installation

1. **Clone the Repository** (if applicable):
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```
2. **Install Dependencies**:
   ```bash
   npm install axios
   ```
3. **Set Up Files**:
   - Place `BankTransferAPI.js` in an `api/` directory.
   - Create `ReceiverAPIs.js` with an array of receiver API URLs (see example below).
   - Create the test script (e.g., `test.js`) in the root directory.

### Example `ReceiverAPIs.js`

```javascript
module.exports = [
    "https://firestore.googleapis.com/v1/projects/receiver1/databases/(default)/documents",
    "https://firestore.googleapis.com/v1/projects/receiver2/databases/(default)/documents"
];
```

## Usage

### Basic Example

```javascript
const BankTransferAPI = require("./api/BankTransferAPI");
const receiverApiList = require("./api/ReceiverAPIs");

const senderApi = "https://firestore.googleapis.com/v1/projects/interbankmanagement/databases/(default)/documents";

async function runTransfer() {
    const bankTransfer = new BankTransferAPI(senderApi, receiverApiList);
    await bankTransfer.fetchIFSCs();

    await bankTransfer.transferMoney(
        "10002972313",  // Sender account number
        "PNB001",       // Sender IFSC
        "50002972313",  // Receiver account number
        "SBIN001",      // Receiver IFSC
        500             // Amount
    );
}

runTransfer().catch(console.error);
```

### Running the Test Script

Save the following as `test.js` and run it:

```javascript
const BankTransferAPI = require("./api/BankTransferAPI");
const receiverApiList = require("./api/ReceiverAPIs");

const senderApi = "https://firestore.googleapis.com/v1/projects/interbankmanagement/databases/(default)/documents";

async function initializeAndTest() {
    console.log("🔵 Initializing bank transfer test...");

    if (!receiverApiList || receiverApiList.length === 0) {
        console.error("❌ No receiver APIs found! Exiting test.");
        return;
    }

    console.log("✅ Receiver APIs loaded:", receiverApiList);

    const bankTransfer = new BankTransferAPI(senderApi, receiverApiList);
    await bankTransfer.fetchIFSCs();

    const senderAccount = "10002972313";
    const senderIfsc = "PNB001";
    const receiverAccount = "50002972313";
    const receiverIfsc = "SBIN001";
    const amountToTransfer = 500;

    await bankTransfer.transferMoney(senderAccount, senderIfsc, receiverAccount, receiverIfsc, amountToTransfer);

    console.log("\n✅ Test completed!");
}

initializeAndTest().catch(error => {
    console.error("❌ Test failed:", error.message);
});
```

Run with:

```bash
node test.js
```

## API Methods

- **`fetchIFSCs()`**: Loads IFSC codes and account details from `lite_profile` into a cache.
- **`validateBankAccount(acct_number, isSender)`**: Checks if an account exists in `bank_account`.
- **`updateBankAccount(acct_number, amount, isSender)`**: Updates `acct_bal` with partial update.
- **`createTransaction(senderAcct, receiverAcct, amount)`**: Logs the transaction in `transaction_history`.
- **`transferMoney(senderAcct, senderIfsc, receiverAcct, receiverIfsc, amount)`**: Executes the full transfer process.

## Data Structures

### `bank_account`

- **Fields**: `acct_number`, `acct_bal`, `cust_id`, `acct_name`.
- **Example**:
  ```json
  {
    "acct_number": { "integerValue": "10002972313" },
    "acct_bal": { "integerValue": "5000" },
    "cust_id": { "integerValue": "123456" },
    "acct_name": { "stringValue": "Dhasagreevan C" }
  }
  ```

### `lite_profile`

- **Fields**: `acct_number`, `ifsc_code`, `name`.
- **Purpose**: Provides IFSC for validation and routing.

### `transaction_history`

- **Fields**: `sender_account`, `receiver_account`, `amount`, `timestamp`.

## Key Implementation Details

- **IFSC Validation**: Both sender and receiver IFSC codes are validated against `lite_profile` cache.
- **Partial Updates**: Uses `updateMask.fieldPaths` in PATCH requests to update only `acct_bal`.
- **Rollback**: Ensures sender balance is restored if receiver update fails.
- **Error Handling**: Logs detailed errors and aborts transfers on validation or update failures.

## Prerequisites

- **Firestore Setup**: Ensure Firestore collections (`bank_account`, `lite_profile`, `transaction_history`) are populated with appropriate data.
- **API Access**: Replace placeholder URLs with actual Firestore API endpoints and ensure proper authentication (e.g., API keys or OAuth).

## Running the Project

1. Configure `senderApi` and `receiverApiList` with valid Firestore endpoints.
2. Ensure test account numbers and IFSC codes exist in the database.
3. Execute the test script:
   ```bash
   node test.js
   ```

## Troubleshooting

- **No Receiver APIs**: Check `ReceiverAPIs.js` for valid URLs.
- **Validation Errors**: Verify account numbers and IFSC codes in `lite_profile` and `bank_account`.
- **API Failures**: Ensure Firestore endpoints are accessible and authenticated.

## Contributing

Feel free to fork, modify, and submit pull requests. Ensure changes maintain the rollback mechanism and IFSC validation.

## License

This project is unlicensed and free to use/modify as needed for your purposes.

---

This updated README reflects the addition of `receiverIfsc` validation, includes clear usage examples, and aligns with the latest `BankTransferAPI` implementation. Let me know if you'd like to tweak any section further!
