import { startPartyServer } from './app';

const port = Number(process.env.PORT ?? 3001);
const timeScale = Number(process.env.PARTYBOX_TIME_SCALE ?? 1);

const server = await startPartyServer({ port, host: process.env.HOST, timeScale });
console.log(`🎉 PartyBox server listening on http://localhost:${server.port}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
