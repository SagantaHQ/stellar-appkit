/**
 * Brute-force diagnostic: tries every conceivable candidate byte sequence
 * against the real Freighter signature the user provided, to find the one
 * that actually matches.
 *
 * Run: bun run scripts/diagnose-signing.ts
 */

import { Keypair } from '@stellar/stellar-sdk';
import { createHash } from 'crypto';

const message = `localhost wants you to sign in with your Stellar account:
GD5G3X25PD6IS3KEUV3QFF2BYXUY2OIUPIV5A5TMX4DSKASDN3EG7CJ6

Statement: Hello, Kindly sigin to continue
URI: http://localhost:3000/
Version: 1
Chain ID: testnet
Nonce: 12229838847ksjskd
Issued At: 2026-08-05T23:01:01.496Z
Expiration Time: 2026-08-05T23:11:01.496Z`;

const signedMessage = 'LxPjVsQFRNVm4Ahwy91yiPu5Y9FXtmFSCMNI/FC0LK9Ryth2jojRt0J9qMYrBPyKfI/XymJ0KZRFeOZDxQcZAQ==';
const signerAddress = 'GD5G3X25PD6IS3KEUV3QFF2BYXUY2OIUPIV5A5TMX4DSKASDN3EG7CJ6';

const kp = Keypair.fromPublicKey(signerAddress);
const sig = Buffer.from(signedMessage, 'base64');

console.log('Signature length:', sig.length, 'bytes');
console.log('Message length:', Buffer.from(message, 'utf-8').length, 'bytes');
console.log('');

const messageUtf8 = Buffer.from(message, 'utf-8');

const candidates: Array<{ label: string; buffer: Buffer }> = [];

// 1-7: The candidates we already try in the verifier
candidates.push({ label: 'utf8(message)', buffer: messageUtf8 });
candidates.push({ label: 'sha256(message)', buffer: createHash('sha256').update(messageUtf8).digest() });
candidates.push({ label: 'sha512(message)', buffer: createHash('sha512').update(messageUtf8).digest() });
candidates.push({ label: 'sha512(message)[:32]', buffer: createHash('sha512').update(messageUtf8).digest().subarray(0, 32) });
candidates.push({ label: 'sha256(\\x00 + message)', buffer: createHash('sha256').update(Buffer.concat([Buffer.from([0]), messageUtf8])).digest() });
candidates.push({ label: 'sha256("stellar-sign-message:" + message)', buffer: createHash('sha256').update(Buffer.concat([Buffer.from('stellar-sign-message:'), messageUtf8])).digest() });
const crlfMessage = Buffer.from(message.replace(/\n/g, '\r\n'), 'utf-8');
candidates.push({ label: 'utf8(message CRLF)', buffer: crlfMessage });

// 8+: New candidates not in the verifier
candidates.push({ label: 'sha256(message CRLF)', buffer: createHash('sha256').update(crlfMessage).digest() });
candidates.push({ label: 'utf8(message + \\n)', buffer: Buffer.from(message + '\n', 'utf-8') });
candidates.push({ label: 'utf8(message trimmed)', buffer: Buffer.from(message.replace(/\n$/, ''), 'utf-8') });

// Sign the hex/base64 STRING of the hash (not the raw hash bytes)
const sha256Hex = createHash('sha256').update(messageUtf8).digest('hex');
candidates.push({ label: 'utf8(hex(sha256(message)))', buffer: Buffer.from(sha256Hex, 'utf-8') });
const sha256B64 = createHash('sha256').update(messageUtf8).digest('base64');
candidates.push({ label: 'utf8(base64(sha256(message)))', buffer: Buffer.from(sha256B64, 'utf-8') });

// Sign the hex/base64 STRING of the message itself
candidates.push({ label: 'utf8(hex(message))', buffer: Buffer.from(messageUtf8.toString('hex'), 'utf-8') });
candidates.push({ label: 'utf8(base64(message))', buffer: Buffer.from(messageUtf8.toString('base64'), 'utf-8') });

// Address + message combinations
candidates.push({ label: 'utf8(address + message)', buffer: Buffer.concat([Buffer.from(signerAddress, 'utf-8'), messageUtf8]) });
candidates.push({ label: 'sha256(address + message)', buffer: createHash('sha256').update(Buffer.concat([Buffer.from(signerAddress, 'utf-8'), messageUtf8])).digest() });
candidates.push({ label: 'utf8(message + address)', buffer: Buffer.concat([messageUtf8, Buffer.from(signerAddress, 'utf-8')]) });
candidates.push({ label: 'sha256(message + address)', buffer: createHash('sha256').update(Buffer.concat([messageUtf8, Buffer.from(signerAddress, 'utf-8')])).digest() });

// Network passphrase + message
const testnetPassphrase = 'Test SDF Network ; September 2015';
candidates.push({ label: 'utf8(passphrase + message)', buffer: Buffer.concat([Buffer.from(testnetPassphrase, 'utf-8'), messageUtf8]) });
candidates.push({ label: 'sha256(passphrase + message)', buffer: createHash('sha256').update(Buffer.concat([Buffer.from(testnetPassphrase, 'utf-8'), messageUtf8])).digest() });

// EIP-191 style prefix
const eip191Prefix = Buffer.from('\x19Stellar Signed Message:\n' + messageUtf8.length + '\n', 'utf-8');
candidates.push({ label: 'utf8(EIP-191 prefix + message)', buffer: Buffer.concat([eip191Prefix, messageUtf8]) });
candidates.push({ label: 'sha256(EIP-191 prefix + message)', buffer: createHash('sha256').update(Buffer.concat([eip191Prefix, messageUtf8])).digest() });

// CR-only line endings
const crMessage = Buffer.from(message.replace(/\n/g, '\r'), 'utf-8');
candidates.push({ label: 'utf8(message CR only)', buffer: crMessage });

// SHA3-256
candidates.push({ label: 'sha3_256(message)', buffer: createHash('sha3-256').update(messageUtf8).digest() });

// Double SHA-256 (Bitcoin-style)
const firstSha256 = createHash('sha256').update(messageUtf8).digest();
candidates.push({ label: 'sha256(sha256(message))', buffer: createHash('sha256').update(firstSha256).digest() });

// Keccak-256 (if available)
try {
  candidates.push({ label: 'keccak256(message)', buffer: createHash('keccak256').update(messageUtf8).digest() });
} catch { /* keccak not available */ }

// Message as ASCII (in case Freighter encodes differently)
candidates.push({ label: 'ascii(message)', buffer: Buffer.from(message, 'ascii') });

// Message as Latin-1
candidates.push({ label: 'latin1(message)', buffer: Buffer.from(message, 'latin1') });

console.log(`Trying ${candidates.length} candidates...\n`);

let found = false;
for (const { label, buffer } of candidates) {
  try {
    const isValid = kp.verify(buffer, sig);
    if (isValid) {
      console.log(`✅ MATCH FOUND: ${label}`);
      console.log(`   Buffer length: ${buffer.length} bytes`);
      console.log(`   SHA-256: ${createHash('sha256').update(buffer).digest('hex')}`);
      found = true;
    } else {
      console.log(`❌ ${label} (${buffer.length} bytes)`);
    }
  } catch (e) {
    console.log(`💥 ${label} — ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (!found) {
  console.log('\n❌ NO MATCH FOUND among ' + candidates.length + ' candidates.');
  console.log('Freighter is signing something completely unexpected.');
  console.log('\nNext step: check the Freighter extension source code');
  console.log('https://github.com/stellar/freighter — look for SUBMIT_BLOB handler');
}
