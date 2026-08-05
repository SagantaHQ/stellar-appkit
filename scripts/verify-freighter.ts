/**
 * Verify that Freighter signs sha256("Stellar Signed Message:\n" + message)
 * using the real user-provided signature data.
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

// The exact prefix Freighter uses (from extension/src/helpers/stellar.ts):
// export const SIGN_MESSAGE_PREFIX = "Stellar Signed Message:\n";
const PREFIX = 'Stellar Signed Message:\n';

const messageBytes = Buffer.from(message, 'utf8');
const prefixBytes = Buffer.from(PREFIX, 'utf8');
const encodedMessage = Buffer.concat([prefixBytes, messageBytes]);
const hashed = createHash('sha256').update(encodedMessage).digest();

console.log('Prefix:', JSON.stringify(PREFIX));
console.log('Encoded message (prefix + message) length:', encodedMessage.length);
console.log('SHA-256 hash length:', hashed.length);
console.log('SHA-256 hash (hex):', hashed.toString('hex'));
console.log('');

const isValid = kp.verify(hashed, sig);
console.log('Verification result:', isValid);

if (isValid) {
  console.log('\n✅ CONFIRMED: Freighter signs sha256("Stellar Signed Message:\\n" + message)');
  console.log('   This is SEP-0053 message encoding.');
  console.log('   The verifier needs this as a candidate.');
} else {
  console.log('\n❌ Still does not match. Trying variations...');

  // Try the raw prefix + message (no hash)
  const rawVerify = kp.verify(encodedMessage, sig);
  console.log('   Raw prefix+message (no hash):', rawVerify);

  // Try with different prefix capitalization
  const prefixes = [
    'Stellar Signed Message:\n',
    'stellar signed message:\n',
    'Stellar Sign Message:\n',
    'stellar-sign-message:',
    'Stellar Signed Message:',
    '\x00Stellar Signed Message:\n',
  ];

  for (const p of prefixes) {
    const buf = Buffer.concat([Buffer.from(p, 'utf8'), messageBytes]);
    const hash = createHash('sha256').update(buf).digest();
    const valid = kp.verify(hash, sig);
    console.log(`   sha256(${JSON.stringify(p)} + message):`, valid);
  }
}
