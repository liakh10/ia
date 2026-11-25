// The plant registry (CONTRACT §7): POST /api/plant/quote, GET /api/plant/:round/:idx (status, then the reveal),
// GET /api/plant/internal/:seq (the runner, signed), GET /api/plant/crank (cron).
import { node, plantRoutes } from '../../registry/dist/ia-verifier.mjs';
export default node(plantRoutes);
