// A custom method-level metadata marker plus a guard that reads it. This is the coexistence proof:
// the marker is attached with Nest's SetMetadata (which stores metadata on the method function),
// and the same service method also carries the canc @AsyncMethod wrapper. Our decorator copies the
// marker onto its wrapper, so the guard still finds it on the wrapped method at request time.

import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';

import { INVOICE_SERVICE } from './invoice.tokens';

export const BILLING_TIER_KEY = 'billingTier';

/** Marks a service method with the billing tier it serves. Read back by BillingTierGuard. */
export const BillingTier = (tier: string) => SetMetadata(BILLING_TIER_KEY, tier);

/** Route handler name -> service method name, so the guard can find the marked service method. */
const HANDLER_TO_METHOD: Record<string, string> = { list: 'listInvoices', bulk: 'generateAll' };

/**
 * Reads the billing tier off the service method the request targets and records it. A real guard
 * would authorize against the tier; here it just proves the marker survived the @AsyncMethod
 * wrapper. The tier sits on the service method (where SetMetadata and @AsyncMethod coexist), not on
 * the controller handler, so the guard reads it off the wrapped method function directly.
 */
@Injectable()
export class BillingTierGuard implements CanActivate {
  static lastSeenTier: string | undefined;

  constructor(@Inject(INVOICE_SERVICE) private readonly invoices: Record<string, unknown>) {}

  canActivate(context: ExecutionContext): boolean {
    const handlerName = context.getHandler().name;
    const methodName = HANDLER_TO_METHOD[handlerName];
    const method = methodName && (this.invoices as any)[methodName];
    BillingTierGuard.lastSeenTier =
      method ? (Reflect.getMetadata(BILLING_TIER_KEY, method) as string | undefined) : undefined;
    return true;
  }
}
