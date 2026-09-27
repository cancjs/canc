import { EntitySchema } from '@mikro-orm/core';

// minimal user entity for search demo
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
