import axios from 'axios';

import { wrapAxios } from '@cancjs/axios';

// wrap requests are always eager, so the lazy option is rejected
// @ts-expect-error lazy is not an axios wrap option
wrapAxios(axios, { lazy: true });

wrapAxios(axios, { shield: true });
