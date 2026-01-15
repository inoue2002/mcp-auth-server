import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from 'mcp-handler';

// The authorization server URL is this same server
const handler = protectedResourceHandler({
  authServerUrls: ['https://mcp-auth-server-five.vercel.app'],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
