import { createMockApi } from '@shared/mock-api';
import { waitForDeployment as waitForDep } from './poll-deploy-vanilla';
import { chargeWithRetry } from './retry-payment-vanilla';
import { fetchInventoryWithTimeout } from './inventory-timeout-vanilla';
import { sendEmailWithDelay } from './email-delay-vanilla';
import { callGatewayWithSignal } from './gateway-signal-vanilla';
import { cleanupPaymentRecord } from './suppress-vanilla';

async function main() {
 const { deployments, payments, inventory, mail, gateway, invoices } = createMockApi();

 console.log('=== vanilla: waitForDeployment ===');
 try {
 const status = await waitForDep(deployments, 'deploy-1');
 console.log('Deployment status:', status);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== vanilla: chargeWithRetry ===');
 try {
 const result = await chargeWithRetry(payments, 'payment-1');
 console.log('Charge result:', result);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== vanilla: fetchInventoryWithTimeout ===');
 try {
 const inventoryLevel = await fetchInventoryWithTimeout(inventory, 'product-1');
 console.log('Inventory:', inventoryLevel);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== vanilla: sendEmailWithDelay ===');
 try {
 await sendEmailWithDelay(mail, 'user@example.com');
 console.log('Email sent');
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== vanilla: callGatewayWithSignal ===');
 try {
 const controller = new AbortController();
 const txn = await callGatewayWithSignal(gateway, controller.signal);
 console.log('Transaction ID:', txn.transactionId);
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }

 console.log('\n=== vanilla: cleanupPaymentRecord ===');
 try {
 await cleanupPaymentRecord(invoices, 'record-1');
 console.log('Cleanup done');
 } catch (err) {
 console.error('Error:', (err as Error).message);
 }
}

main();
