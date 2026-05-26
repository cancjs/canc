import { createMockApi } from '@shared/mock-api';
import { waitForDeployment as waitForDep } from './poll-deploy-canc';
import { chargeWithRetry } from './retry-payment-canc';
import { fetchInventoryWithTimeout } from './inventory-timeout-canc';
import { sendEmailWithDelay } from './email-delay-canc';
import { callGatewayWithSignal } from './gateway-signal-canc';
import { cleanupPaymentRecord } from './suppress-canc';

async function main() {
 const { deployments, payments, inventory, mail, gateway, invoices } = createMockApi();

 console.log('=== canc: waitForDeployment ===');
 try {
 const status = await waitForDep(deployments, 'deploy-1');
 console.log('Deployment status:', status);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== canc: chargeWithRetry ===');
 try {
 const result = await chargeWithRetry(payments, 'payment-1');
 console.log('Charge result:', result);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== canc: fetchInventoryWithTimeout ===');
 try {
 const inventoryLevel = await fetchInventoryWithTimeout(inventory, 'product-1');
 console.log('Inventory:', inventoryLevel);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== canc: sendEmailWithDelay ===');
 try {
 await sendEmailWithDelay(mail, 'user@example.com');
 console.log('Email sent');
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== canc: callGatewayWithSignal ===');
 try {
 // Demonstrates external AbortSignal at the call site for signal interop.
 const controller = new AbortController();
 const txn = await callGatewayWithSignal(gateway, controller.signal);
 console.log('Transaction ID:', txn.transactionId);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== canc: cleanupPaymentRecord ===');
 try {
 await cleanupPaymentRecord(invoices, 'record-1');
 console.log('Cleanup done');
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }
}

main();
