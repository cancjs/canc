import type { MockApiBundle } from '@shared/mock-api';
import type { AxiosAdapter } from 'axios';

// The mock adapter's config/response shapes are a simplified subset of axios's real
// InternalAxiosRequestConfig, so it isn't structurally assignable to AxiosAdapter. This is the
// one place that boundary gets crossed; every call site imports this instead of casting itself.
export function toAxiosAdapter(bundle: MockApiBundle): AxiosAdapter {
  return bundle.axiosAdapter as unknown as AxiosAdapter;
}
