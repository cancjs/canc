import { createCheckoutCancelable } from '../src/checkout-canc';
import { createCheckoutVanilla } from '../src/checkout-vanilla';
import { NegativeChargeError } from '../src/mock/checkout-ops';

describe('demo-coroutine checkout domain error', () => {
  const reserveStock = async (orderId: string) => ({
    id: `res-${orderId}`,
    productId: 'p1',
  });
  const charge = async (orderId: string) => ({
    id: `charge-${orderId}`,
    amount: -25,
  });
  const addPoints = async () => ({ points: 50 });
  const confirm = async (orderId: string, chargeId: string) => ({
    confirmationId: `conf-${orderId}-${chargeId}`,
    orderId,
  });
  const releaseReservation = async () => undefined;
  const legacyConfirmEmail = async () => undefined;

  it('-canc rejects with NegativeChargeError on negative charge', async () => {
    const checkoutCanc = createCheckoutCancelable(
      reserveStock,
      charge,
      addPoints,
      confirm,
      releaseReservation,
      legacyConfirmEmail,
    );

    const cancErr = await checkoutCanc('order-canc').catch((err: unknown) => err);
    expect(cancErr).toBeInstanceOf(NegativeChargeError);
    expect((cancErr as Error).name).toBe('NegativeChargeError');
  });

  it('-vanilla rejects with NegativeChargeError on negative charge', async () => {
    const checkoutVanilla = createCheckoutVanilla(
      reserveStock,
      charge,
      addPoints,
      confirm,
      releaseReservation,
      legacyConfirmEmail,
    );

    const controller = new AbortController();
    const vanillaErr = await checkoutVanilla('order-vanilla', controller.signal).catch((err: unknown) => err);
    expect(vanillaErr).toBeInstanceOf(NegativeChargeError);
    expect((vanillaErr as Error).name).toBe('NegativeChargeError');
  });

  it('both twins reject with the same error class on negative charge', async () => {
    const checkoutCanc = createCheckoutCancelable(
      reserveStock,
      charge,
      addPoints,
      confirm,
      releaseReservation,
      legacyConfirmEmail,
    );

    const checkoutVanilla = createCheckoutVanilla(
      reserveStock,
      charge,
      addPoints,
      confirm,
      releaseReservation,
      legacyConfirmEmail,
    );

    const controller = new AbortController();
    const cancErr = await checkoutCanc('order-canc').catch((err: unknown) => err);
    const vanillaErr = await checkoutVanilla('order-vanilla', controller.signal).catch((err: unknown) => err);

    expect(cancErr).toBeInstanceOf(NegativeChargeError);
    expect(vanillaErr).toBeInstanceOf(NegativeChargeError);
    expect((cancErr as Error).constructor).toBe((vanillaErr as Error).constructor);
  });
});
