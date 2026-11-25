// The log's other routes (CONTRACT §8): GET /api/log/anchors, GET /api/log/transcript/:seq/:agent/:run (after settlement),
// POST /api/log/transcript and /api/log/harness (the runner, signed), POST /api/log/forecast (a wallet-signed forecast).
import { node, logRoutes } from '../../registry/dist/ia-verifier.mjs';
export default node(logRoutes);
