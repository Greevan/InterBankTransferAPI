Below is a detailed documentation for the `BankTransferAPI` project based on the provided code. This documentation covers the purpose, usage, methods, and key considerations for the API implementation.

---

# BankTransferAPI Documentation

## Overview

The `BankTransferAPI` is a Node.js class designed to facilitate bank transfers between accounts using Firestore as the backend database. It integrates with multiple APIs (sender and receiver endpoints) to validate accounts, update balances, and record transaction history. The API ensures secure and atomic transactions with rollback capabilities in case of failures.

### Key Features

- **Account Validation**: Validates sender and receiver accounts using `bank_account` and `lite_profile` collections.
- **Balance Updates**: Updates account balances with partial updates to preserve other fields.
- **Transaction Recording**: Logs transactions across multiple receiver APIs.
- **Rollback Mechanism**: Reverts sender balance updates if receiver updates fail.
- **IFSC Caching**: Caches IFSC codes from `lite_profile` for efficient lookups.

### Dependencies

- **axios**: For making HTTP requests to Firestore APIs.
- **Node.js**: Runtime environment.

## Installation

1. Ensure Node.js is installed.
2. Install the required dependency:
   ```bash
   npm install axios
   ```
3. Save the code in a file named `BankTransferAPI.js`.

## Usage

### Initialization

```javascript
const BankTransferAPI = require('./BankTransferAPI');

// Example API endpoints
const senderApi = 'https://firestore.googleapis.com/v1/projects/interbankmanagement/databases/(default)/documents';
const receiverApiBaseUrls = [
    'https://firestore.googleapis.com/v1/projects/receiver1/databases/(default)/documents',
    'https://firestore.googleapis.com/v1/projects/receiver2/databases/(default)/documents'
];

const bankTransfer = new BankTransferAPI(senderApi, receiverApiBaseUrls);

// Populate IFSC cache
await bankTransfer.fetchIFSCs();
```

### Performing a Transfer

```javascript
// Transfer money
await bankTransfer.transferMoney(
    '10002972313',  // senderAcct
    'IFSC1234',     // senderIfsc
    '20003456789',  // receiverAcct
    1000            // amount
);
```

## Class Structure

### Constructor

```javascript
constructor(senderApi, receiverApiBaseUrls)
```

- **senderApi**: String URL of the sender's Firestore API endpoint.
- **receiverApiBaseUrls**: Array of string URLs for receiver Firestore API endpoints.
- Initializes IFSC cache and API-to-IFSC mapping.

### Methods

#### `fetchIFSCs()`

```javascript
async fetchIFSCs()
```

- **Description**: Fetches IFSC codes and account details from `lite_profile` collections across all receiver APIs.
- **Returns**: `Promise<void>`
- **Behavior**: Populates `ifscCache` (account number to IFSC/name mapping) and `apiByIfsc` (IFSC to API mapping).
- **Logs**: Success/failure messages for each API fetch.

#### `fetchDocument(url)`

```javascript
async fetchDocument(url)
```

- **Description**: Helper method to fetch documents from a Firestore endpoint.
- **Parameters**:
  - `url`: String URL of the Firestore collection.
- **Returns**: `Promise<Array>` - Array of documents or empty array on error.
- **Logs**: Fetch attempts and errors.

#### `validateBankAccount(acct_number, isSender = true)`

```javascript
async validateBankAccount(acct_number, isSender)
```

- **Description**: Validates the existence of an account in the `bank_account` collection.
- **Parameters**:
  - `acct_number`: String or number representing the account number.
  - `isSender`: Boolean indicating if the account is a sender (default: `true`).
- **Returns**: `Promise<boolean>` - `true` if account exists, `false` otherwise.
- **Behavior**:
  - Uses `senderApi` for sender accounts.
  - Determines receiver API from `ifscCache` and `apiByIfsc` for receiver accounts.
- **Logs**: Validation attempts and results.

#### `updateBankAccount(acct_number, amount, isSender = true)`

```javascript
async updateBankAccount(acct_number, amount, isSender)
```

- **Description**: Updates the account balance in the `bank_account` collection.
- **Parameters**:
  - `acct_number`: String or number representing the account number.
  - `amount`: Number to add/subtract from the current balance (positive for credit, negative for debit).
  - `isSender`: Boolean indicating if the account is a sender (default: `true`).
- **Returns**: `Promise<boolean>` - `true` on success, `false` on failure.
- **Behavior**:
  - Fetches the account document.
  - Calculates new balance.
  - Uses PATCH with `updateMask` to update only `acct_bal`, preserving other fields.
- **Logs**: Update attempts, new balance, and results.

#### `createTransaction(senderAcct, receiverAcct, amount)`

```javascript
async createTransaction(senderAcct, receiverAcct, amount)
```

- **Description**: Records a transaction in the `transaction_history` collection across all receiver APIs.
- **Parameters**:
  - `senderAcct`: String sender account number.
  - `receiverAcct`: String receiver account number.
  - `amount`: Number amount transferred.
- **Returns**: `Promise<void>`
- **Behavior**: Posts transaction data with timestamp to all receiver APIs.
- **Logs**: Transaction recording attempts and results.

#### `transferMoney(senderAcct, senderIfsc, receiverAcct, amount)`

```javascript
async transferMoney(senderAcct, senderIfsc, receiverAcct, amount)
```

- **Description**: Orchestrates a complete money transfer process.
- **Parameters**:
  - `senderAcct`: String sender account number.
  - `senderIfsc`: String sender IFSC code.
  - `receiverAcct`: String receiver account number.
  - `amount`: Number amount to transfer.
- **Returns**: `Promise<void>`
- **Behavior**:
  1. Validates sender account in `bank_account`.
  2. Verifies sender IFSC in `lite_profile`.
  3. Validates receiver account in `bank_account`.
  4. Deducts amount from sender balance.
  5. Adds amount to receiver balance.
  6. Records transaction.
  7. Rolls back sender balance if receiver update fails.
- **Logs**: Detailed transfer process and outcomes.

## Data Structures

### `bank_account` Collection

- **Fields**:
  - `acct_number`: Integer/String - Account number.
  - `acct_bal`: Integer - Account balance.
  - `cust_id`: Integer - Customer ID.
  - `acct_name`: String - Account holder name.
- **Example**:
  ```json
  {
    "name": "projects/interbankmanagement/databases/(default)/documents/bank_account/946vMkmQmw1GYJKcrVzk",
    "fields": {
      "acct_number": { "integerValue": "10002972313" },
      "acct_bal": { "integerValue": "5000" },
      "cust_id": { "integerValue": "123456" },
      "acct_name": { "stringValue": "Dhasagreevan C" }
    }
  }
  ```

### `lite_profile` Collection

- **Fields**:
  - `acct_number`: Integer/String - Account number.
  - `ifsc_code`: String - IFSC code.
  - `name`: String - Account holder name.
- **Purpose**: Provides IFSC information for routing.

### `transaction_history` Collection

- **Fields**:
  - `sender_account`: String - Sender account number.
  - `receiver_account`: String - Receiver account number.
  - `amount`: Integer - Transfer amount.
  - `timestamp`: Timestamp - Date and time of transaction.

## Error Handling

- **Validation Failures**: Logs and aborts transfer if accounts or IFSC codes are invalid.
- **API Errors**: Logs errors and returns `false` or empty results for failed requests.
- **Transaction Rollback**: Reverts sender balance if receiver update fails.

## Considerations

- **Atomicity**: Partial rollback ensures sender funds are not lost on failure.
- **Field Preservation**: Uses `updateMask` in PATCH requests to avoid overwriting unrelated fields.
- **Scalability**: Supports multiple receiver APIs for distributed transaction logging.
- **Security**: Assumes API endpoints are authenticated and secure (not implemented in code).

## Example Flow

1. Initialize: `new BankTransferAPI(senderApi, receiverApiBaseUrls)`
2. Cache IFSCs: `await fetchIFSCs()`
3. Transfer: `await transferMoney('10002972313', 'IFSC1234', '20003456789', 1000)`
   - Validates accounts.
   - Updates balances.
   - Records transaction.
   - Rolls back if necessary.

## License

This is a custom implementation and does not include a specific license. Use and modify as per your project requirements.

---

This documentation provides a comprehensive guide to understanding and using the `BankTransferAPI`. Let me know if you'd like to expand on any section or add more examples!
