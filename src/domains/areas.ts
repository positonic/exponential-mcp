import { z } from 'zod';
import { type Domain, id, op } from './framework.js';

export const areas: Domain = {
  name: 'areas',
  description:
    'Areas: per-product buckets a feature is filed under (exactly one or none). Products are in `products`; file a feature under an area via `features` create/update `areaId`.',
  operations: {
    list: op({
      summary: 'List a product’s areas in display order, with feature counts.',
      params: z.object({ productId: id('Product') }),
      run: (client, params) => client.areas.list(params),
    }),
    create: op({
      summary: 'Create an area at the end of a product’s list. Names are unique per product.',
      params: z.object({
        productId: id('Product'),
        name: z.string(),
        description: z.string().optional(),
      }),
      run: (client, params) => client.areas.create(params),
    }),
  },
};
