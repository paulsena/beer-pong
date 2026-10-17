import type { TableId } from '@bp/shared';
import type { EnvironmentFactory } from './types';
import { createBasement } from './basement';
import { createBackyard } from './backyard';

export const ENVIRONMENTS: Record<TableId, EnvironmentFactory> = {
  basement: createBasement,
  backyard: createBackyard,
};
export type * from './types';
