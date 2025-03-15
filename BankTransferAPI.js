const axios = require('axios');
const receiverAPIs = require('./receiverAPIs');

class BankTransferAPI {
    constructor(senderApiBaseUrl) {
        this.senderApiBaseUrl = senderApiBaseUrl;
        this.receiverApiBaseUrls = receiverAPIs;
        this.ifscCache = new Map(); // Stores IFSC, account numbers, and names
    }

    async fetchAllIFSCData() {
        try {
            const fetchPromises = this.receiverApiBaseUrls.map(async (baseUrl) => {
                const url = `${baseUrl}/lite_profile`;
                try {
                    const response = await axios.get(url);
                    const documents = response.data.documents || [];

                    documents.forEach((doc) => {
                        const data = doc.fields;
                        const ifscCode = data.ifsc_code?.stringValue;
                        const accountNumber = data.acct_number?.stringValue || data.acct_number?.integerValue;
                        const name = data.name?.stringValue;
                        if (ifscCode && accountNumber) {
                            this.ifscCache.set(accountNumber, { ifscCode, name });
                        }
                    });
                } catch (error) {
                    console.warn(`Failed to fetch from ${url}:`, error.message);
                }
            });

            await Promise.all(fetchPromises);
            console.log("IFSC cache populated:", this.ifscCache);
        } catch (error) {
            console.error("Error fetching IFSC data:", error.message);
            throw new Error("Failed to fetch IFSC data");
        }
    }

    async fetchBankAccount(accountNumber) {
        const url = `${this.senderApiBaseUrl}/bank_account`;
        try {
            const response = await axios.get(url);
            const documents = response.data.documents || [];

            for (const doc of documents) {
                const data = doc.fields;
                if (data.acct_number?.integerValue == accountNumber) {
                    return {
                        id: doc.name.split('/').pop(),
                        balance: parseInt(data.acct_balance?.integerValue),
                        status: data.acct_status?.stringValue,
                    };
                }
            }

            throw new Error("Sender bank account not found");
        } catch (error) {
            console.error("Error fetching bank account:", error.message);
            throw new Error("Failed to fetch bank account");
        }
    }

    validateTransfer(senderAccount, receiverAccountNumber, receiverIFSC, receiverName, amount) {
        if (!this.ifscCache.has(receiverAccountNumber)) {
            throw new Error("Receiver account number not found in IFSC database");
        }

        const receiverDetails = this.ifscCache.get(receiverAccountNumber);
        if (receiverDetails.ifscCode !== receiverIFSC) {
            throw new Error("Receiver IFSC code mismatch");
        }
        if (receiverDetails.name !== receiverName) {
            throw new Error("Receiver name mismatch");
        }
        if (senderAccount.status !== "active") {
            throw new Error("Sender account is not active");
        }
        if (senderAccount.balance < amount) {
            throw new Error("Insufficient balance in sender account");
        }
    }

    async updateBankAccount(accountId, newBalance) {
        const url = `${this.senderApiBaseUrl}/bank_account/${accountId}`;
        try {
            await axios.patch(url, {
                fields: { acct_balance: { integerValue: newBalance } },
            });
            console.log("Bank account updated successfully");
        } catch (error) {
            console.error("Error updating bank account:", error.message);
            throw new Error("Failed to update bank account");
        }
    }

    async createTransaction(sender, receiver, amount) {
        const transactionData = {
            sender_account: sender,
            receiver_account: receiver,
            amount: amount,
            timestamp: new Date().toISOString(),
        };

        try {
            const fetchPromises = this.receiverApiBaseUrls.map(async (baseUrl) => {
                const url = `${baseUrl}/transaction_history`;
                try {
                    await axios.post(url, { fields: transactionData });
                    console.log(`Transaction recorded successfully in ${baseUrl}`);
                } catch (error) {
                    console.warn(`Failed to record transaction in ${baseUrl}:`, error.message);
                }
            });

            await Promise.all(fetchPromises);
        } catch (error) {
            console.error("Error recording transaction:", error.message);
            throw new Error("Failed to create transaction history");
        }
    }

    async transferMoney(senderAccountNumber, receiverAccountNumber, receiverIFSC, receiverName, amount) {
        try {
            if (this.ifscCache.size === 0) {
                await this.fetchAllIFSCData();
            }

            const senderAccount = await this.fetchBankAccount(senderAccountNumber);
            const senderAccountId = senderAccount.id;

            this.validateTransfer(senderAccount, receiverAccountNumber, receiverIFSC, receiverName, amount);

            const newSenderBalance = senderAccount.balance - amount;
            await this.updateBankAccount(senderAccountId, newSenderBalance);

            await this.createTransaction(senderAccountNumber, receiverAccountNumber, amount);

            console.log(`Successfully transferred ₹${amount} from ${senderAccountNumber} to ${receiverAccountNumber}`);
        } catch (error) {
            console.error("Transfer failed:", error.message);
        }
    }
}

module.exports = BankTransferAPI;
