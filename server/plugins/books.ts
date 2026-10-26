import { definePlugin } from 'nitro';
import { useBookStore } from '~/server/stores/useBookStore.ts';

export default definePlugin((app) => {
  app.hooks.hook('close', useBookStore().close);
});
