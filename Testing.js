const BankTransferAPI = require('./BankTransferAPI');

const senderApi = "https://firestore.googleapis.com/v1/projects/interbankmanagement/databases/(default)/documents";

const bankTransfer = new BankTransferAPI(senderApi);

(async () => {
    await bankTransfer.transferMoney(
        "10002972313", // Sender Account Number
        "10006067", // Receiver Account Number
        "RSK01", // Receiver IFSC Code
        "Sandhiya", // Receiver Name
        500 // Amount
    );
})();
