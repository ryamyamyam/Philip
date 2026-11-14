import { META } from '../db/repo';
import { useMeta } from './useData';

/** Story 11: this device is paired with Philip in the cloud (a Worker URL in the build + a token). */
export function useCloudPaired(): boolean {
  const token = useMeta<string>(META.coachCloudToken);
  const url = (import.meta.env.VITE_PUSH_URL as string | undefined)?.trim();
  return !!url && typeof token === 'string' && token.trim().length > 0;
}
