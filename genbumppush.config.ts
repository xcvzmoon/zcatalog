import { defineConfig } from 'genbumppush';

export default defineConfig({
  hooks: {
    before: ['pnpm check', 'pnpm test'],
  },
  github: {
    enabled: true,
  },
  gitlab: {
    enabled: true,
    remote: 'gitlab',
    project: 'monalbertgamil/zcatalog',
    host: 'https://git.centralizedinc.com',
  },
});
