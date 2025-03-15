// api/BankTransferAPI.js
const axios = require("axios");

class BankTransferAPI {
    constructor(senderApi, receiverApiBaseUrls) {
        this.senderApi = senderApi;              // Dedicated sender API (used for updates only)
        this.receiverApiBaseUrls = receiverApiBaseUrls; // Receiver APIs (used for fetching IFSC and updates)
        this.ifscCache = new Map();
        this.apiByIfsc = new Map(); // New map to store IFSC-to-API mapping
    }

    async fetchIFSCs() {
        console.log("📡 Fetching IFSC codes from Firestore (Receiver APIs only)...");
        const fetchPromises = this.receiverApiBaseUrls.map(async (baseUrl) => {
            try {
                const url = `${baseUrl}/lite_profile`;
                const response = await axios.get(url);
                const documents = response.data.documents || [];
                
                documents.forEach(doc => {
                    const acctNumber = doc.fields?.acct_number?.stringValue || 
                                     (doc.fields?.acct_number?.integerValue?.toString());
                    if (acctNumber) {
                        const ifscCode = doc.fields?.ifsc_code?.stringValue || 'unknown';
                        this.ifscCache.set(acctNumber, {
                            ifscCode: ifscCode,
                            name: doc.fields?.name?.stringValue || 'unknown'
                        });
                        // Map IFSC to the API it came from
                        this.apiByIfsc.set(ifscCode, baseUrl);
                    } else {
                        console.warn(`⚠️ Skipping document from ${baseUrl} due to missing acct_number:`, doc);
                    }
                });
                console.log(`✅ Fetched from ${baseUrl}: ${documents.length} documents`);
            } catch (error) {
                console.error(`❌ Error fetching from ${baseUrl}:`, error.message);
            }
        });
    
        await Promise.all(fetchPromises);
        console.log("✅ IFSC cache populated:", this.ifscCache);
        console.log("✅ API by IFSC mapping:", this.apiByIfsc);
    }

    async fetchDocument(url) {
        console.log(`🔍 Fetching document from: ${url}`);
        try {
            const response = await axios.get(url);
            return response.data.documents || [];
        } catch (error) {
            console.error("❌ Error fetching document:", error.message);
            return [];
        }
    }

    async validateLiteProfile(ifsc, acct_number) {
        console.log(`🔍 Validating IFSC and Account Number: ${acct_number}, IFSC: ${ifsc}`);
        const profile = this.ifscCache.get(acct_number);
        if (!profile || profile.ifscCode !== ifsc) {
            console.error("❌ Invalid IFSC Code or Account Number!");
            return false;
        }
        console.log(`✅ Lite profile validated for: ${profile.name} (Account: ${acct_number})`);
        return true;
    }

    async updateBankAccount(acct_number, amount, isSender = true) {
        console.log(`💰 Updating bank account balance for Account: ${acct_number}, Amount: ${amount}`);
        try {
            // Choose API based on sender or receiver
            let url;
            if (isSender) {
                url = `${this.senderApi}/bank_account`;
            } else {
                const profile = this.ifscCache.get(acct_number);
                if (!profile) {
                    console.error(`❌ No profile found in cache for Account: ${acct_number}`);
                    return false;
                }
                const apiBaseUrl = this.apiByIfsc.get(profile.ifscCode);
                if (!apiBaseUrl) {
                    console.error(`❌ No API mapped for IFSC: ${profile.ifscCode}`);
                    return false;
                }
                url = `${apiBaseUrl}/bank_account`;
            }
    
            // Fetch all bank accounts from Firestore
            const accounts = await this.fetchDocument(url);
    
            // Find the correct document by matching acct_number
            const account = accounts.find(doc => {
                const docAcctNumber = doc.fields.acct_number?.integerValue?.toString() || 
                                     doc.fields.acct_number?.stringValue;
                return docAcctNumber === acct_number;
            });
    
            if (!account) {
                console.error(`❌ Bank account not found for Account: ${acct_number} in ${url}`);
                return false;
            }
    
            // Extract Firestore Document ID from "name"
            const docId = account.name.split("/").pop();
            const updateUrl = `${url}/${docId}`;
    
            // Get current balance
            const currentBalance = parseInt(account.fields.acct_balance.integerValue);
            const newBalance = currentBalance + amount;
    
            console.log(`💳 Updating balance for ${acct_number}: New Balance ₹${newBalance}`);
    
            // Firestore update payload
            const payload = {
                fields: {
                    acct_balance: { integerValue: newBalance.toString() }
                }
            };
    
            await axios.patch(updateUrl, payload);
            console.log(`✅ Account ${acct_number} successfully updated.`);
            return true;
        } catch (error) {
            console.error("❌ Error updating bank account:", error.message);
            return false;
        }
    }

    async createTransaction(senderAcct, receiverAcct, amount) {
        console.log(`📜 Recording transaction: ₹${amount} from ${senderAcct} to ${receiverAcct}`);
        const transactionData = {
            fields: {
                sender_account: { stringValue: senderAcct },
                receiver_account: { stringValue: receiverAcct },
                amount: { integerValue: amount.toString() },
                timestamp: { timestampValue: new Date().toISOString() }
            }
        };

        const fetchPromises = this.receiverApiBaseUrls.map(async (baseUrl) => {
            try {
                const url = `${baseUrl}/transaction_history`;
                await axios.post(url, transactionData);
                console.log(`✅ Transaction recorded in ${baseUrl}`);
            } catch (error) {
                console.warn(`⚠️ Failed to record transaction in ${baseUrl}:`, error.message);
            }
        });

        await Promise.all(fetchPromises);
    }

    async transferMoney(senderAcct, senderIfsc, receiverAcct, amount) {
        console.log("\n🚀 Starting money transfer...");
        console.log(`📩 Sender: ${senderAcct} (IFSC: ${senderIfsc})`);
        console.log(`📤 Receiver: ${receiverAcct} (Amount: ₹${amount})`);

        const valid = await this.validateLiteProfile(senderIfsc, senderAcct);
        if (!valid) {
            console.log("❌ Transfer aborted due to validation failure.");
            return;
        }

        const senderUpdated = await this.updateBankAccount(senderAcct, -amount, true);
        if (!senderUpdated) {
            console.log("❌ Transfer aborted: Unable to deduct sender's balance.");
            return;
        }

        const receiverUpdated = await this.updateBankAccount(receiverAcct, amount, false);
        if (!receiverUpdated) {
            // Rollback sender's deduction
            await this.updateBankAccount(senderAcct, amount, true);
            console.log("❌ Transfer aborted: Unable to update receiver's balance. Rolled back sender's balance.");
            return;
        }

        await this.createTransaction(senderAcct, receiverAcct, amount);
        console.log(`✅ Transfer successful: ₹${amount} from ${senderAcct} to ${receiverAcct}`);
    }
}

module.exports = BankTransferAPI;