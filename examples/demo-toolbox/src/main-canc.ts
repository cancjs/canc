import { createMockApiBundle } from '@shared/mock-api';
import { waitForDeployment as waitForDep } from './poll-deploy-canc';
import { chargeWithRetry } from './retry-payment-canc';
import { fetchInventoryWithTimeout } from './inventory-timeout-canc';
import { sendEmailWithDelay } from './email-delay-canc';
import { callGatewayWithSignal } from './gateway-signal-canc';
import { cleanupPaymentRecord } from './suppress-canc';

async function main() {
 const mockApi = createMockApiBundle();

 console.log('=== canc: waitForDeployment ===');
 try {
 const status = await waitForDep(mockApi, 'deploy-1');
 console.log('Deployment status:', status);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== canc: chargeWithRetry ===');
 try {
 const result = await chargeWithRetry(mockApi, 'payment-1');
 console.log('Charge result:', result);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== canc: fetchInventoryWithTimeout ===');
 try {
 const inventory = await fetchInventoryWithTimeout(mockApi, 'product-1');
 console.log('Inventory:', inventory);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== canc: sendEmailWithDelay ===');
 try {
 await sendEmailWithDelay(mockApi, 'user@example.com');
 console.log('Email sent');
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== canc: callGatewayWithSignal ===');
 try {
 const controller = new AbortController();
 const txn = await callGatewayWithSignal(mockApi, controller.signal);
 console.log('Transaction ID:', txn.transactionId);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== canc: cleanupPaymentRecord ===');
 try {
 await cleanupPaymentRecord(mockApi, 'record-1');
 console.log('Cleanup done');
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }
}

main();
