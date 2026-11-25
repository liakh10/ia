// GET /api/plant: the registry's description (filter version, log key, bundle hash). CONTRACT §7.
import { node, plantRoutes } from '../../registry/dist/ia-verifier.mjs';
export default node(plantRoutes);
