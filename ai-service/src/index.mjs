import { startSam9Service } from './sam9-core.mjs';

startSam9Service().catch((error) => {
    console.error('[sam9] startup failed:', error);
    process.exit(1);
});
