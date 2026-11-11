const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTED_PREFIX = 'v1';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey() {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (typeof keyHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
        throw new Error('ENCRYPTION_KEY debe configurarse como una clave hexadecimal de 32 bytes.');
    }
    return Buffer.from(keyHex, 'hex');
}

function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith(`${ENCRYPTED_PREFIX}:`);
}

function encrypt(text) {
    if (typeof text !== 'string') {
        throw new TypeError('El valor a cifrar debe ser texto.');
    }
    if (text === '') return '';

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    const encrypted = Buffer.concat([
        cipher.update(text, 'utf8'),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    return [
        ENCRYPTED_PREFIX,
        iv.toString('base64url'),
        authTag.toString('base64url'),
        encrypted.toString('base64url')
    ].join(':');
}

function decrypt(hash) {
    if (typeof hash !== 'string' || !isEncrypted(hash)) {
        throw new TypeError('El valor almacenado no tiene un formato cifrado compatible.');
    }

    const [, ivEncoded, authTagEncoded, encryptedEncoded, ...extra] = hash.split(':');
    if (!ivEncoded || !authTagEncoded || !encryptedEncoded || extra.length
        || !/^[A-Za-z0-9_-]+$/.test(ivEncoded)
        || !/^[A-Za-z0-9_-]+$/.test(authTagEncoded)
        || !/^[A-Za-z0-9_-]+$/.test(encryptedEncoded)) {
        throw new Error('El valor cifrado está malformado.');
    }

    const iv = Buffer.from(ivEncoded, 'base64url');
    const authTag = Buffer.from(authTagEncoded, 'base64url');
    const encrypted = Buffer.from(encryptedEncoded, 'base64url');
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH || encrypted.length === 0) {
        throw new Error('El valor cifrado tiene longitudes inválidas.');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ]).toString('utf8');
}

module.exports = { encrypt, decrypt, isEncrypted };
