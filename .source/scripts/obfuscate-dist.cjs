'use strict';

/**
 * Obfuscate the browser-ready output only.
 * Do not run this against JSX or third-party source files.
 * This is a deterrent to casual reading, not cryptographic encryption.
 */
const fs = require('node:fs');
const path = require('node:path');
const obfuscator = require('javascript-obfuscator');

const assets = path.join(__dirname, '..', 'dist', 'assets');
const files = fs.readdirSync(assets).filter(name => name.endsWith('.js'));
if (files.length === 0) {
  throw new Error('No compiled JavaScript assets found; stopping publication.');
}
for (const file of files) {
  const filename = path.join(assets, file);
  const original = fs.readFileSync(filename, 'utf8');
  if (!original.trim()) throw new Error('Empty JS output: ' + file);
  const result = obfuscator.obfuscate(original, {
    target: 'browser',
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    renameProperties: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    selfDefending: false,
    simplify: true,
    numbersToExpressions: false,
    splitStrings: false,
    stringArray: true,
    stringArrayThreshold: 0.22,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayCallsTransform: false,
    unicodeEscapeSequence: false,
    sourceMap: false
  }).getObfuscatedCode();
  if (!result || result.length < 100) {
    throw new Error('Unexpected obfuscation output for ' + file);
  }
  fs.writeFileSync(filename, result, 'utf8');
  console.log('Protected JS:', file, original.length, '=>', result.length, 'characters');
}
for (const file of fs.readdirSync(assets)) {
  if (file.endsWith('.map')) fs.unlinkSync(path.join(assets, file));
}
