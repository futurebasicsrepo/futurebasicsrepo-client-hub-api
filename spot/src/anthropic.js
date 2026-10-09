// One place that builds the Anthropic client. An API key that isn't scoped
// to a workspace must name one on every request (anthropic-workspace-id);
// set ANTHROPIC_WORKSPACE_ID for that, or use a workspace-scoped key.
import Anthropic from '@anthropic-ai/sdk';

export function anthropicClient(env = process.env) {
  const ws = env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic(ws ? { defaultHeaders: { 'anthropic-workspace-id': ws } } : {});
}

export { Anthropic };
