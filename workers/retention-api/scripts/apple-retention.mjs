import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { AppStoreServerAPIClient } from '@apple/app-store-server-library';

// Operator-only CLI, never imported by the Worker or published by Pages.
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  environment: { type: 'string', default: 'Sandbox' },
  yes: { type: 'boolean', default: false },
  'message-id': { type: 'string' }, file: { type: 'string' },
  url: { type: 'string' }, 'transaction-id': { type: 'string' }, 'request-id': { type: 'string' },
} });
const command = positionals[0];
const commands = new Set(['status', 'upload-message', 'set-defaults', 'set-url', 'performance-test', 'performance-result']);
if (!commands.has(command) || positionals.length !== 1) {
  console.error('Usage: node scripts/apple-retention.mjs <status|upload-message|set-defaults|set-url|performance-test|performance-result> [options]');
  process.exit(2);
}
if (!['Sandbox', 'Production'].includes(values.environment)) throw new Error('Choose Sandbox or Production.');
if (!['status', 'performance-result'].includes(command) && !values.yes) {
  throw new Error('This command changes Apple configuration. Review the inputs and pass --yes.');
}
function requireValue(value, name) {
  if (typeof value !== 'string' || !value) throw new Error(`Missing ${name}.`);
  return value;
}
function messageId() {
  const value = requireValue(values['message-id'], '--message-id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('Message ID must be a lowercase UUID.');
  }
  return value;
}
const privateKey = await readFile(requireValue(process.env.IAP_PRIVATE_KEY_PATH, 'IAP_PRIVATE_KEY_PATH'), 'utf8');
const client = new AppStoreServerAPIClient(privateKey,
  requireValue(process.env.IAP_KEY_ID, 'IAP_KEY_ID'),
  requireValue(process.env.IAP_ISSUER_ID, 'IAP_ISSUER_ID'),
  'com.vkohli.ZoeyCalendar', values.environment);
try {
  if (command === 'status') {
    const [url, messages] = await Promise.all([client.getRealtimeURL(), client.getMessageList()]);
    console.log(JSON.stringify({ environment: values.environment, url, messages }, null, 2));
  } else if (command === 'upload-message') {
    const body = JSON.parse(await readFile(requireValue(values.file, '--file'), 'utf8'));
    if (typeof body.header !== 'string' || body.header.length > 66
        || typeof body.body !== 'string' || body.body.length > 144
        || Object.keys(body).some(key => !['header', 'body'].includes(key))) {
      throw new Error('Use a text-only message with header<=66 and body<=144 characters.');
    }
    await client.uploadMessage(messageId(), body);
    console.log('Message uploaded. Check its approval state before configuring defaults or enabling offers.');
  } else if (command === 'set-defaults') {
    const id = messageId();
    const list = await client.getMessageList();
    if (!list.messageIdentifiers?.some(message => message.messageIdentifier === id && message.messageState === 'APPROVED')) {
      throw new Error('The selected message is not approved.');
    }
    for (const product of ['shared.monthly', 'shared.yearly']) {
      await client.configureDefaultMessage(`com.vkohli.zoeycalendar.${product}`, 'en-US', { messageIdentifier: id });
    }
    console.log('Both en-US product defaults configured.');
  } else if (command === 'set-url') {
    const url = new URL(requireValue(values.url, '--url'));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
        || url.pathname !== '/v1/apple/retention'
        || (values.environment === 'Production' && url.hostname !== 'api.duetcalendar.com')) {
      throw new Error('Use the deployed HTTPS retention callback; production must use api.duetcalendar.com.');
    }
    await client.configureRealtimeURL({ realtimeURL: url.href });
    console.log('Callback URL configured; verify it using status.');
  } else if (command === 'performance-test') {
    if (values.environment !== 'Sandbox') throw new Error('Performance tests run only in Sandbox.');
    const id = requireValue(values['transaction-id'], '--transaction-id');
    if (!/^\d{1,64}$/.test(id)) throw new Error('Use a verified sandbox original transaction ID.');
    console.log(JSON.stringify(await client.initiatePerformanceTest({ originalTransactionId: id }), null, 2));
  } else {
    console.log(JSON.stringify(await client.getPerformanceTestResults(requireValue(values['request-id'], '--request-id')), null, 2));
  }
} catch (error) {
  // Avoid dumping SDK response bodies, credentials, tokens or transaction IDs.
  console.error(JSON.stringify({ error: 'apple_request_failed', httpStatusCode: error.httpStatusCode,
    apiError: error.apiError, guidance: 'Check Apple access, message approval, and reviewed command inputs.' }));
  process.exitCode = 1;
}
