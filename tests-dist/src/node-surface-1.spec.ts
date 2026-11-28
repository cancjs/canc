import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '../..');
const probe =
  'const assert=require(\'node:assert/strict\'),{createRequire}=require(\'node:module\'),fs=require(\'node:fs\'),os=require(\'node:os\'),path=require(\'node:path\');\nconst load=n=>process.env.FORMAT===\'CJS\'?Promise.resolve(require(n)):import(n);\n(async()=>{const data={"crypto":{"retained":{"values":["Hash","Hmac","KeyObject","Sign","Verify","argon2","checkPrime","constants","createCipheriv","createDecipheriv","createHash","createHmac","createPrivateKey","createPublicKey","createSecretKey","createSign","createVerify","decapsulate","encapsulate","generateKey","generateKeyPair","generatePrime","hkdf","pbkdf2","randomBytes","randomFill","randomUUID","scrypt","subtle","webcrypto"]},"removed":["BasePrivateKeyEncodingOptions","Certificate","Cipher","CipherInfo","CipherInfoOptions","CipherMode","DSAEncoding","DSAKeyPairKeyObjectOptions","DSAKeyPairOptions","Decipher","DiffieHellman","DiffieHellmanGroup","DiffieHellmanGroupConstructor","ECDH","ECDHKeyFormat","ECKeyPairKeyObjectOptions","ECKeyPairOptions","ED25519KeyPairKeyObjectOptions","ED25519KeyPairOptions","ED448KeyPairKeyObjectOptions","ED448KeyPairOptions","JsonWebKey","KeyPairKeyObjectResult","KeyPairSyncResult","KeyType","RSAKeyPairKeyObjectOptions","RSAKeyPairOptions","RSAPSSKeyPairKeyObjectOptions","RSAPSSKeyPairOptions","RsaPrivateKey","RsaPublicKey","SecureHeapUsage","X25519KeyPairKeyObjectOptions","X25519KeyPairOptions","X448KeyPairKeyObjectOptions","X448KeyPairOptions","X509Certificate","X509CheckOptions","checkPrimeSync","createCipher","createDecipher","createDiffieHellman","createDiffieHellmanGroup","createECDH","diffieHellman","fips","generateKeyPairSync","generateKeySync","generatePrimeSync","getCipherInfo","getCiphers","getCurves","getDiffieHellman","getFips","getHashes","getRandomValues","hash","hkdfSync","pbkdf2Sync","privateDecrypt","privateEncrypt","pseudoRandomBytes","publicDecrypt","publicEncrypt","randomFillSync","randomInt","scryptSync","secureHeapUsed","setEngine","setFips","sign","timingSafeEqual","verify"],"nativeValues":["Hash","Hmac","KeyObject","Sign","Verify","constants","createCipheriv","createDecipheriv","createHash","createHmac","createPrivateKey","createPublicKey","createSecretKey","createSign","createVerify","randomUUID","subtle","webcrypto"]}},core=await load(\'@cancjs/promise\'),node=await load(\'@cancjs/node\'),c=await load(\'@cancjs/node/crypto\'),z=await load(\'@cancjs/node/zlib\'),d=await load(\'@cancjs/node/dgram\'),f=await load(\'@cancjs/node/fs/extra\'),nc=require(\'node:crypto\'),nz=require(\'node:zlib\');\nfor(const [mod,actual,native] of [[\'crypto\',c,nc]]){assert.deepEqual(Object.keys(actual).sort(),data[mod].retained.values.slice().sort());for(const key of data[mod].nativeValues)assert.equal(actual[key],native[key],mod+\' \'+key);for(const key of data[mod].removed)assert.equal(key in actual,false,mod+\' \'+key)}\nconst bytes=await c.randomBytes(16);assert.equal(bytes.length,16);const pb=c.pbkdf2(\'p\',\'s\',100000,16,\'sha256\');const cancel=assert.rejects(Promise.resolve(pb),core.isCancelError);pb.cancel();await cancel;\nconsole.log(\'PASS row 1 \'+process.env.FORMAT)\n})().catch(e=>{console.error(e);process.exitCode=1});\n';

it.each(['CJS', 'ESM'])('Node public surface row 1 %s', (format) => {
  const tempRoot = path.join(os.tmpdir(), 'canc');
  fs.mkdirSync(tempRoot, { recursive: true });
  const owned = fs.mkdtempSync(path.join(tempRoot, 'canc-node-surface-'));
  try {
    for (const [src, target] of [
      ['node', '@cancjs/node'],
      ['node', 'node-physical-copy'],
      ['promise', '@cancjs/promise'],
      ['toolbox', '@cancjs/toolbox'],
    ]) {
      const dest = path.join(owned, 'node_modules', target);
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(path.join(repo, 'packages', 'canc-' + src, 'package.json'), path.join(dest, 'package.json'));
      fs.cpSync(path.join(repo, 'packages', 'canc-' + src, 'dist'), path.join(dest, 'dist'), { recursive: true });
      expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
    }
    fs.cpSync(path.join(repo, 'node_modules', 'graceful-fs'), path.join(owned, 'node_modules', 'graceful-fs'), {
      recursive: true,
      dereference: true,
    });
    const output = execFileSync(process.execPath, ['--unhandled-rejections=strict', '-e', probe], {
      cwd: owned,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, FORMAT: format },
    });
    expect(output).toContain('PASS row 1 ' + format);
  } finally {
    fs.rmSync(owned, { recursive: true, force: true });
  }
});
