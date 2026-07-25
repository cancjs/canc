import { EntitySchema } from '@mikro-orm/core';

// The one entity the demo searches. Kept intentionally small; the point is cancellation, not a
// rich domain model.
export interface User {
  id: number;
  name: string;
  email: string;
  city: string;
}

export const UserSchema = new EntitySchema<User>({
  name: 'User',
  tableName: 'users',
  properties: {
    id: { type: 'number', primary: true },
    name: { type: 'string' },
    email: { type: 'string' },
    city: { type: 'string' },
  },
});
