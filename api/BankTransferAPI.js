const axios = require("axios");

class BankTransferAPI {
    constructor(senderApi, receiverApiBaseUrls) {
        this.senderApi = senderApi;
        this.receiverApiBaseUrls = receiverApiBaseUrls;
        this.ifscCache = new Map();
        this.apiByIfsc = new Map();
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

    async validateBankAccount(acct_number, isSender = true) {
        console.log(`🔍 Validating bank account: ${acct_number}`);
        try {
            let url = isSender ? `${this.senderApi}/bank_account` : null;
            
            if (!isSender) {
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

            const accounts = await this.fetchDocument(url);
            const account = accounts.find(doc => {
                const docAcctNumber = doc.fields.acct_number?.stringValue || 
                                   doc.fields.acct_number?.integerValue?.toString();
                return docAcctNumber === acct_number;
            });

            if (!account) {
                console.error(`❌ Account ${acct_number} not found in bank_account collection`);
                return false;
            }

            console.log(`✅ Bank account validated for: ${acct_number}`);
            return true;
        } catch (error) {
            console.error(`❌ Error validating bank account ${acct_number}:`, error.message);
            return false;
        }
    }

    async updateBankAccount(acct_number, amount, isSender = true) {
        console.log(`💰 Updating bank account balance for Account: ${acct_number}, Amount: ${amount}`);
        try {
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
    
            const accounts = await this.fetchDocument(url);
            const account = accounts.find(doc => {
                const docAcctNumber = doc.fields.acct_number?.integerValue?.toString() || 
                                   doc.fields.acct_number?.stringValue;
                return docAcctNumber === acct_number;
            });
    
            if (!account) {
                console.error(`❌ Bank account not found for Account: ${acct_number} in ${url}`);
                return false;
            }
    
            const docId = account.name.split("/").pop();
            const updateUrl = `${url}/${docId}`;
            const currentBalance = parseInt(account.fields.acct_bal.integerValue);
            const newBalance = currentBalance + amount;
    
            console.log(`💳 Updating balance for ${acct_number}: New Balance ₹${newBalance}`);
    
            const payload = {
                fields: {
                    acct_bal: { integerValue: newBalance.toString() }
                }
            };
    
            await axios.patch(updateUrl, payload, {
                params: {
                    'updateMask.fieldPaths': 'acct_bal'
                }
            });
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

    async transferMoney(senderAcct, senderIfsc, receiverAcct, receiverIfsc, amount) {
        console.log("\n🚀 Starting money transfer...");
        console.log(`📩 Sender: ${senderAcct} (IFSC: ${senderIfsc})`);
        console.log(`📤 Receiver: ${receiverAcct} (IFSC: ${receiverIfsc}, Amount: ₹${amount})`);

        // Validate sender account in bank_account
        const senderValid = await this.validateBankAccount(senderAcct, true);
        if (!senderValid) {
            console.log("❌ Transfer aborted: Sender account not found in bank_account.");
            return;
        }

        // Verify sender IFSC from lite_profile
        const senderProfile = this.ifscCache.get(senderAcct);
        if (!senderProfile || senderProfile.ifscCode !== senderIfsc) {
            console.log("❌ Transfer aborted: Sender IFSC validation failed in lite_profile.");
            return;
        }

        // Validate receiver account in bank_account
        const receiverValid = await this.validateBankAccount(receiverAcct, false);
        if (!receiverValid) {
            console.log("❌ Transfer aborted: Receiver account not found in bank_account.");
            return;
        }

        // Verify receiver IFSC from lite_profile
        const receiverProfile = this.ifscCache.get(receiverAcct);
        if (!receiverProfile || receiverProfile.ifscCode !== receiverIfsc) {
            console.log("❌ Transfer aborted: Receiver IFSC validation failed in lite_profile.");
            return;
        }

        // Update sender balance
        const senderUpdated = await this.updateBankAccount(senderAcct, -amount, true);
        if (!senderUpdated) {
            console.log("❌ Transfer aborted: Unable to deduct sender's balance.");
            return;
        }

        // Update receiver balance
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